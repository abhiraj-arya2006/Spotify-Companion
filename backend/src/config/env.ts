/**
 * config/env.ts
 *
 * Loads and validates all required environment variables at startup.
 * The application will refuse to start if any required variable is missing.
 * Variable VALUES are never logged — only their names are checked.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env relative to the backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
      `Check your .env file. See .env.example for the expected variables.`
    );
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const env = {
  spotify: {
    clientId: requireEnv('SPOTIFY_CLIENT_ID'),
    clientSecret: requireEnv('SPOTIFY_CLIENT_SECRET'),
    redirectUri: requireEnv('SPOTIFY_REDIRECT_URI'),
    // Scopes requested from Spotify:
    // User profile, listening history, library, and playlist creation/editing
    scopes: [
      'user-read-private',
      'user-read-email',
      'user-top-read',
      'user-library-read',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private',
    ].join(' '),
  },
  gemini: {
    apiKey: requireEnv('GEMINI_API_KEY'),
  },
  session: {
    secret: requireEnv('SESSION_SECRET'),
  },
  server: {
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  },
} as const;

// Log which variables are present (not their values)
console.log('[config] Environment loaded:');
console.log(`  SPOTIFY_CLIENT_ID       : ${env.spotify.clientId ? '✓ set' : '✗ missing'}`);
console.log(`  SPOTIFY_CLIENT_SECRET   : ${env.spotify.clientSecret ? '✓ set' : '✗ missing'}`);
console.log(`  SPOTIFY_REDIRECT_URI    : ${env.spotify.redirectUri}`);
console.log(`  GEMINI_API_KEY          : ${env.gemini.apiKey ? '✓ set' : '✗ missing'}`);
console.log(`  SESSION_SECRET          : ${env.session.secret ? '✓ set' : '✗ missing'}`);
console.log(`  PORT                    : ${env.server.port}`);
console.log(`  NODE_ENV                : ${env.server.nodeEnv}`);
