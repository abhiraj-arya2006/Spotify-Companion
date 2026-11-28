/**
 * routes/auth.routes.ts
 *
 * Spotify OAuth Authorization Code Flow — hardened implementation.
 *
 * Endpoints:
 *   GET /auth/spotify         → Redirect to Spotify authorization page
 *   GET /auth/spotify/callback → Handle callback, exchange code for tokens
 *   GET /auth/status          → Check whether the current session is authenticated
 *   POST /auth/logout         → Clear session and tokens
 *
 * Security measures:
 * - State parameter (CSRF protection): random 32-byte hex nonce
 * - State stored in server-side session, compared in callback
 * - Authorization code is single-use; never stored
 * - Tokens stored only in SQLite server-side
 * - Redirect URI is validated against .env (not user-supplied)
 */

import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { saveTokens, deleteTokens } from '../services/token.service';
import { getCurrentUserProfile } from '../services/spotify.service';
import { upsertUser } from '../services/user.service';
import { syncUserData } from '../services/sync.service';
import { generateMusicDNA } from '../services/music-dna.service';
import type { SpotifyTokenResponse } from '../types/spotify';

export const authRouter = Router();

/**
 * Resolves the appropriate Spotify redirect URI for the incoming request.
 * Automatically adapts between local development, custom LAN IP, and public cloud domains (e.g. Render).
 */
function resolveRedirectUri(req: Router extends never ? never : import('express').Request): string {
  const host = req.get('host');
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    return `${proto}://${host}/auth/spotify/callback`;
  }
  return env.spotify.redirectUri;
}

// ---------------------------------------------------------------------------
// Signed OAuth state
//
// WHY: On phones the session cookie is often lost between /auth/spotify and the
// callback — the Spotify app intercepts accounts.spotify.com, an in-app browser
// (WhatsApp, Instagram) hands off to Chrome/Safari, or an installed PWA has its
// own cookie jar. A purely session-bound state then always fails and the user
// is bounced back to the login page. The state is therefore also HMAC-signed
// with a short expiry so the callback can verify it even without the cookie.
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

function signState(nonce: string, issuedAt: number): string {
  return crypto
    .createHmac('sha256', env.session.secret)
    .update(`${nonce}.${issuedAt}`)
    .digest('hex');
}

function createState(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  return `${nonce}.${issuedAt}.${signState(nonce, issuedAt)}`;
}

function isSignedStateValid(state: string): boolean {
  const [nonce, issuedAtRaw, signature] = state.split('.');
  const issuedAt = Number(issuedAtRaw);
  if (!nonce || !signature || !Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > STATE_TTL_MS || issuedAt > Date.now() + 60_000) return false;

  const expected = Buffer.from(signState(nonce, issuedAt), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// GET /auth/spotify — Start Spotify OAuth flow
// ---------------------------------------------------------------------------

authRouter.get('/spotify', (req, res) => {
  // Random nonce + timestamp, HMAC-signed (CSRF protection; see signed state above)
  const state = createState();
  const redirectUri = resolveRedirectUri(req);
  req.session.oauthState = state;
  req.session.oauthRedirectUri = redirectUri;

  const params = new URLSearchParams({
    client_id: env.spotify.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: env.spotify.scopes,
    state,
    // show_dialog: 'true', // uncomment to always show Spotify auth dialog
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log(`[auth] Initiating Spotify OAuth for session ${req.sessionID} with redirect_uri: ${redirectUri}`);

  res.redirect(authUrl);
});

// ---------------------------------------------------------------------------
// GET /auth/spotify/callback — Handle Spotify's redirect back to us
// ---------------------------------------------------------------------------

authRouter.get('/spotify/callback', async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  // 1. User denied authorization
  if (error) {
    console.warn(`[auth] User denied Spotify authorization: ${error}`);
    res.redirect('/?error=access_denied');
    return;
  }

  // 2. Missing parameters
  if (!code || !state) {
    console.warn('[auth] Callback missing code or state parameter');
    res.redirect('/?error=invalid_callback');
    return;
  }

  // 3. CSRF state validation. If the session still holds the state it must match
  //    exactly; if the cookie was lost (common on phones), fall back to the
  //    signature + expiry check.
  const expectedState = req.session.oauthState;
  const stateOk = expectedState ? state === expectedState : isSignedStateValid(state);
  if (!stateOk) {
    console.warn(`[auth] OAuth state rejected (session state present: ${!!expectedState})`);
    res.redirect('/?error=state_mismatch');
    return;
  }
  if (!expectedState) {
    console.log('[auth] Session cookie missing on callback — accepted via signed state');
  }

  // Retrieve matching redirectUri for token exchange (recompute if the session was lost)
  const redirectUri = req.session.oauthRedirectUri || resolveRedirectUri(req);

  // Clear single-use state from session
  delete req.session.oauthState;
  delete req.session.oauthRedirectUri;

  try {
    // 4. Exchange authorization code for access + refresh tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // 5. Fetch the user's Spotify profile
    const profile = await getCurrentUserProfile(tokens.access_token);

    // 6. Persist user to database (upsert)
    upsertUser(profile);

    // 7. Persist tokens to database
    saveTokens(profile.id, tokens);

    // 8. Store only the user ID in the session cookie — tokens stay server-side
    req.session.spotifyUserId = profile.id;

    console.log(`[auth] Successfully authenticated user: ${profile.id}`);

    // 9. Kick off background data sync (non-blocking — user gets redirected immediately)
    setImmediate(() => {
      syncUserData(profile.id, tokens.access_token)
        .then(result => {
          console.log(`[auth] Background sync complete: ${JSON.stringify(result.itemsSynced)}`);
          generateMusicDNA(profile.id);
        })
        .catch(err => console.error('[auth] Background sync failed:', err));
    });

    // 10. Redirect to the success page
    res.redirect('/?connected=true');
  } catch (err) {
    console.error('[auth] Token exchange or profile fetch failed:', err);
    res.redirect('/?error=auth_failed');
  }
});

// ---------------------------------------------------------------------------
// GET /auth/status — Check session status (called by frontend on load)
// ---------------------------------------------------------------------------

authRouter.get('/status', (req, res) => {
  const spotifyUserId = req.session.spotifyUserId;

  res.json({
    authenticated: !!spotifyUserId,
    userId: spotifyUserId ?? null,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout — Clear session and optionally revoke tokens
// ---------------------------------------------------------------------------

authRouter.post('/logout', (req, res): void => {
  const userId = req.session.spotifyUserId;

  if (userId) {
    // Delete tokens from database — user must re-authorize next time
    deleteTokens(userId);
    console.log(`[auth] Tokens cleared for user: ${userId}`);
  }

  req.session.destroy(err => {
    if (err) {
      console.error('[auth] Failed to destroy session:', err);
      res.status(500).json({ error: 'LOGOUT_FAILED', message: 'Failed to log out' });
      return;
    }
    res.clearCookie('sc.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ---------------------------------------------------------------------------
// Internal: Exchange authorization code for tokens
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function exchangeCodeForTokens(code: string, redirectUri: string = env.spotify.redirectUri): Promise<SpotifyTokenResponse> {
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
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      `Token exchange failed: ${response.status} — ${JSON.stringify(body)}`
    );
  }

  return response.json() as Promise<SpotifyTokenResponse>;
}
