/**
 * services/token.service.ts
 *
 * Manages Spotify OAuth token lifecycle:
 * - Saving tokens after initial authorization
 * - Reading tokens for a user
 * - Refreshing expired access tokens
 * - Detecting expired/revoked refresh tokens (invalid_grant)
 *
 * IMPORTANT: Spotify refresh tokens expire 6 months from original authorization.
 * Refreshing an access token does NOT extend the refresh token's lifetime.
 * When we receive invalid_grant, we must delete the tokens and force re-login.
 */

import { getDb } from '../db/database';
import { env } from '../config/env';
import type { SpotifyTokenResponse, StoredTokens } from '../types/spotify';

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// ---------------------------------------------------------------------------
// Token storage operations
// ---------------------------------------------------------------------------

export function saveTokens(userId: string, tokens: SpotifyTokenResponse): void {
  const db = getDb();

  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const now = Date.now();

  // If Spotify doesn't return a new refresh_token (this can happen on refresh),
  // keep the existing one
  const existingTokens = getTokens(userId);
  const refreshToken = tokens.refresh_token ?? existingTokens?.refresh_token;

  if (!refreshToken) {
    throw new Error('No refresh token available — user must re-authorize');
  }

  const stmt = db.prepare(`
    INSERT INTO tokens (user_id, access_token, refresh_token, expires_at, scope, obtained_at, updated_at)
    VALUES (@userId, @accessToken, @refreshToken, @expiresAt, @scope, @obtainedAt, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = @accessToken,
      refresh_token = @refreshToken,
      expires_at    = @expiresAt,
      scope         = @scope,
      updated_at    = @updatedAt
  `);

  stmt.run({
    userId,
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt,
    scope: tokens.scope,
    obtainedAt: existingTokens?.obtained_at ?? now,
    updatedAt: now,
  });
}

export function getTokens(userId: string): (StoredTokens & { obtained_at: number }) | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT access_token, refresh_token, expires_at, scope, obtained_at
    FROM tokens
    WHERE user_id = ?
  `).get(userId) as (StoredTokens & { obtained_at: number }) | undefined;

  return row ?? null;
}

export function deleteTokens(userId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Returns a valid access token for the user, refreshing if necessary.
 * Throws if the refresh token has expired (invalid_grant) or is missing.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const tokens = getTokens(userId);

  if (!tokens) {
    throw new TokenError('NO_TOKENS', 'No tokens found for user — please reconnect Spotify');
  }

  // Access token is still valid (with 5-min buffer)
  if (tokens.expires_at - TOKEN_BUFFER_MS > Date.now()) {
    return tokens.access_token;
  }

  // Access token is expired — refresh it
  console.log(`[token] Access token expired for user ${userId}. Refreshing...`);
  return refreshAccessToken(userId, tokens.refresh_token);
}

async function refreshAccessToken(userId: string, refreshToken: string): Promise<string> {
  const credentials = Buffer.from(
    `${env.spotify.clientId}:${env.spotify.clientSecret}`
  ).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
    const errorCode = errorBody['error'] as string | undefined;

    if (response.status === 400 && errorCode === 'invalid_grant') {
      // Refresh token is expired (6-month limit) or was revoked by the user
      console.warn(`[token] Refresh token expired for user ${userId}. Clearing tokens.`);
      deleteTokens(userId);
      throw new TokenError(
        'REFRESH_TOKEN_EXPIRED',
        'Your Spotify authorization has expired. Please reconnect your account.'
      );
    }

    throw new TokenError(
      'REFRESH_FAILED',
      `Failed to refresh Spotify token: ${response.status} ${errorCode ?? 'unknown'}`
    );
  }

  const freshTokens = await response.json() as SpotifyTokenResponse;
  saveTokens(userId, freshTokens);

  console.log(`[token] Access token refreshed successfully for user ${userId}`);
  return freshTokens.access_token;
}

// ---------------------------------------------------------------------------
// Custom error class for token-specific failures
// ---------------------------------------------------------------------------

export type TokenErrorCode =
  | 'NO_TOKENS'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'REFRESH_FAILED';

export class TokenError extends Error {
  constructor(
    public readonly code: TokenErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'TokenError';
  }
}
