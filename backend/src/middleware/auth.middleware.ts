/**
 * middleware/auth.middleware.ts
 *
 * requireAuth — Express middleware that:
 * 1. Checks the session for a Spotify user ID.
 * 2. Gets a valid access token (refreshing if expired).
 * 3. Attaches the token and userId to res.locals for downstream route handlers.
 *
 * Usage: router.get('/protected', requireAuth, handler)
 */

import type { Request, Response, NextFunction } from 'express';
import { getValidAccessToken, TokenError } from '../services/token.service';

export interface AuthLocals {
  spotifyUserId: string;
  accessToken: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const spotifyUserId = req.session.spotifyUserId;

  if (!spotifyUserId) {
    res.status(401).json({
      error: 'NOT_AUTHENTICATED',
      message: 'Please connect your Spotify account first.',
    });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(spotifyUserId);
    res.locals['spotifyUserId'] = spotifyUserId;
    res.locals['accessToken'] = accessToken;
    next();
  } catch (err) {
    if (err instanceof TokenError) {
      if (err.code === 'REFRESH_TOKEN_EXPIRED') {
        // Clear the session — user must log in again
        req.session.destroy(() => {
          res.status(401).json({
            error: 'SESSION_EXPIRED',
            message: err.message,
            requiresReauth: true,
          });
        });
        return;
      }

      res.status(401).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

/** Type-safe accessor for auth locals set by requireAuth */
export function getAuthLocals(res: Response): AuthLocals {
  return {
    spotifyUserId: res.locals['spotifyUserId'] as string,
    accessToken: res.locals['accessToken'] as string,
  };
}
