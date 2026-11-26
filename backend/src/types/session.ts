/**
 * types/session.ts
 *
 * Extends express-session's SessionData type so TypeScript knows
 * about our custom session properties.
 */

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /**
     * The Spotify user ID of the authenticated user.
     * This is the only user-identifying value stored in the session cookie.
     * All tokens are stored server-side in SQLite, keyed by this ID.
     */
    spotifyUserId?: string;

    /**
     * CSRF protection: a random nonce generated when OAuth starts.
     * Compared against the `state` parameter in the callback to prevent CSRF.
     */
    oauthState?: string;
  }
}
