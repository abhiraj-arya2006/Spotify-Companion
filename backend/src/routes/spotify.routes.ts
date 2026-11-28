/**
 * routes/spotify.routes.ts
 *
 * Spotify data endpoints — all protected by requireAuth middleware.
 *
 * GET /spotify/profile         → Current user's Spotify profile
 * GET /spotify/player/token    → Access token + capability flags for in-app playback
 * GET /spotify/top/tracks      → User's top tracks (short/medium/long term)
 * GET /spotify/top/artists     → User's top artists
 * GET /spotify/library/tracks  → User's saved library tracks
 * GET /spotify/playlists       → User's playlists
 */

import { Router } from 'express';
import { requireAuth, getAuthLocals } from '../middleware/auth.middleware';
import {
  getCurrentUserProfile,
  getUserTopTracks,
  getUserTopArtists,
  getSavedTracks,
  getUserPlaylists,
  createPlaylist,
  addTracksToPlaylist,
  resolveTracks,
  SpotifyApiError,
} from '../services/spotify.service';
import { getUserById } from '../services/user.service';
import { getTokens } from '../services/token.service';
import type { TimeRange } from '../types/spotify';

export const spotifyRouter = Router();

const MAX_PLAYLIST_TRACKS = 100;
const TRACK_URI_RE = /^spotify:track:[A-Za-z0-9]{22}$/;

// All routes in this file require authentication
spotifyRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /spotify/profile
// ---------------------------------------------------------------------------

spotifyRouter.get('/profile', async (_req, res, next) => {
  try {
    const { accessToken, spotifyUserId } = getAuthLocals(res);

    // Fetch fresh profile from Spotify
    const spotifyProfile = await getCurrentUserProfile(accessToken);

    // Also include our stored user data (created_at, etc.)
    const storedUser = getUserById(spotifyUserId);

    res.json({
      profile: spotifyProfile,
      meta: {
        userId: spotifyUserId,
        memberSince: storedUser?.created_at ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /spotify/player/token
//
// The Web Playback SDK runs in the browser and needs the user's own access
// token. Also reports whether in-app playback is possible: Spotify only allows
// it for Premium accounts that granted the `streaming` scope.
// ---------------------------------------------------------------------------

spotifyRouter.get('/player/token', (_req, res) => {
  const { accessToken, spotifyUserId } = getAuthLocals(res);
  const tokens = getTokens(spotifyUserId);
  const scopes = (tokens?.scope ?? '').split(' ');
  const isPremium = getUserById(spotifyUserId)?.product === 'premium';
  const hasStreamingScope = scopes.includes('streaming') && scopes.includes('user-modify-playback-state');

  res.json({
    accessToken,
    expiresAt: tokens?.expires_at ?? null,
    isPremium,
    canStream: isPremium && hasStreamingScope,
    // Premium, but logged in before playback scopes were added
    needsReconnect: isPremium && !hasStreamingScope,
  });
});

// ---------------------------------------------------------------------------
// GET /spotify/top/tracks?timeRange=medium_term&limit=20
// ---------------------------------------------------------------------------

spotifyRouter.get('/top/tracks', async (req, res, next) => {
  try {
    const { accessToken } = getAuthLocals(res);
    const timeRange = validateTimeRange(req.query['timeRange'] as string);
    const limit = validateLimit(req.query['limit'] as string, 20);

    const result = await getUserTopTracks(accessToken, timeRange, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /spotify/top/artists?timeRange=medium_term&limit=20
// ---------------------------------------------------------------------------

spotifyRouter.get('/top/artists', async (req, res, next) => {
  try {
    const { accessToken } = getAuthLocals(res);
    const timeRange = validateTimeRange(req.query['timeRange'] as string);
    const limit = validateLimit(req.query['limit'] as string, 20);

    const result = await getUserTopArtists(accessToken, timeRange, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /spotify/library/tracks?limit=50&offset=0
// ---------------------------------------------------------------------------

spotifyRouter.get('/library/tracks', async (req, res, next) => {
  try {
    const { accessToken } = getAuthLocals(res);
    const limit = validateLimit(req.query['limit'] as string, 50);
    const offset = parseInt((req.query['offset'] as string) ?? '0', 10) || 0;

    const result = await getSavedTracks(accessToken, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /spotify/playlists?limit=50&offset=0
// ---------------------------------------------------------------------------

spotifyRouter.get('/playlists', async (req, res, next) => {
  try {
    const { accessToken } = getAuthLocals(res);
    const limit = validateLimit(req.query['limit'] as string, 50);
    const offset = parseInt((req.query['offset'] as string) ?? '0', 10) || 0;

    const result = await getUserPlaylists(accessToken, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /spotify/tracks/resolve — Preview & resolve track queries to Spotify IDs
// ---------------------------------------------------------------------------

spotifyRouter.post('/tracks/resolve', async (req, res, next) => {
  try {
    const { accessToken } = getAuthLocals(res);
    const { tracks } = req.body as { tracks?: Array<{ title: string; artist: string }> };

    if (!Array.isArray(tracks) || tracks.length === 0) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'An array of track items is required.' });
      return;
    }

    const resolved = await resolveTracks(accessToken, tracks.slice(0, 50));
    res.json({ resolved, count: resolved.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /spotify/playlists — Create a playlist and populate with tracks
// ---------------------------------------------------------------------------

spotifyRouter.post('/playlists', async (req, res, next) => {
  try {
    const { accessToken, spotifyUserId } = getAuthLocals(res);
    const {
      name,
      description = 'Curated by Spotify Companion AI',
      tracks = [],
      isPublic = false,
    } = req.body as {
      name?: string;
      description?: string;
      tracks?: Array<{ title: string; artist: string } | string>;
      isPublic?: boolean;
    };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Playlist name is required.' });
      return;
    }

    // Check if the user's stored token has the required write scopes
    const userTokens = getTokens(spotifyUserId);
    const hasWriteScope = userTokens?.scope?.includes('playlist-modify-public') || userTokens?.scope?.includes('playlist-modify-private');
    if (!hasWriteScope) {
      res.status(403).json({
        error: 'INSUFFICIENT_SCOPES',
        message: 'Your Spotify authorization does not include playlist creation permissions yet. Please reconnect your Spotify account to grant write access.',
        needsReauth: true,
      });
      return;
    }

    if (!Array.isArray(tracks) || tracks.length > MAX_PLAYLIST_TRACKS) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: `tracks must be an array of at most ${MAX_PLAYLIST_TRACKS} items.`,
      });
      return;
    }

    // 1. Work out the exact track URIs BEFORE creating anything, so a bad
    //    request never leaves an empty playlist behind in the user's library.
    //    Preferred input: already-resolved URIs/IDs (what the user reviewed).
    //    Fallback: {title, artist} pairs that we resolve here.
    const urisToAdd: string[] = [];
    const queriesToResolve: Array<{ title: string; artist: string }> = [];

    for (const t of tracks) {
      if (typeof t === 'string') {
        const uri = t.startsWith('spotify:track:') ? t : `spotify:track:${t}`;
        if (!TRACK_URI_RE.test(uri)) {
          res.status(400).json({ error: 'INVALID_INPUT', message: `Invalid Spotify track reference: ${t}` });
          return;
        }
        urisToAdd.push(uri);
      } else if (t && typeof t === 'object' && typeof t.title === 'string' && t.title.trim()) {
        queriesToResolve.push({ title: t.title, artist: typeof t.artist === 'string' ? t.artist : '' });
      }
    }

    if (queriesToResolve.length > 0) {
      const resolved = await resolveTracks(accessToken, queriesToResolve);
      for (const r of resolved) {
        if (r.matched && r.uri) urisToAdd.push(r.uri);
      }
    }

    const uniqueUris = [...new Set(urisToAdd)];
    if (uniqueUris.length === 0) {
      res.status(400).json({ error: 'NO_TRACKS', message: 'None of the tracks could be matched on Spotify.' });
      return;
    }

    // 2. Create the playlist (Spotify caps descriptions at 300 chars)
    console.log(`[spotify] Creating playlist "${name}" with ${uniqueUris.length} tracks for user ${spotifyUserId}`);
    const newPlaylist = await createPlaylist(
      accessToken,
      name.trim().slice(0, 100),
      description.trim().slice(0, 300),
      isPublic
    );

    // 3. Add tracks (batched in groups of 100 by the service)
    await addTracksToPlaylist(accessToken, newPlaylist.id, uniqueUris);
    const urisToAddCount = uniqueUris.length;

    res.json({
      success: true,
      playlist: {
        id: newPlaylist.id,
        name: newPlaylist.name,
        description: newPlaylist.description,
        spotifyUrl: newPlaylist.external_urls.spotify,
        tracksAdded: urisToAddCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateTimeRange(value: string | undefined): TimeRange {
  const valid: TimeRange[] = ['short_term', 'medium_term', 'long_term'];
  return valid.includes(value as TimeRange) ? (value as TimeRange) : 'medium_term';
}

function validateLimit(value: string | undefined, defaultValue: number): number {
  const parsed = parseInt(value ?? String(defaultValue), 10);
  if (isNaN(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, 50);
}

// ---------------------------------------------------------------------------
// Error handler specific to Spotify API errors
// ---------------------------------------------------------------------------

spotifyRouter.use((
  err: Error,
  _req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) => {
  if (err instanceof SpotifyApiError) {
    res.status(err.statusCode >= 500 ? 502 : err.statusCode).json({
      error: 'SPOTIFY_API_ERROR',
      message: err.message,
      statusCode: err.statusCode,
    });
    return;
  }
  next(err);
});
