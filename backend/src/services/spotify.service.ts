/**
 * services/spotify.service.ts
 *
 * Thin wrapper around Spotify Web API HTTP calls.
 *
 * Design principles:
 * - Each function takes the access token as a parameter (not looked up internally).
 *   The middleware layer is responsible for providing valid tokens.
 * - Functions throw on HTTP errors with meaningful messages.
 * - Pagination helpers are included for endpoints that return paged results.
 * - Endpoints known to return 403 for new apps (audio-features, recommendations,
 *   related-artists) are NOT implemented here. Gemini handles recommendations instead.
 */

import type {
  SpotifyUserProfile,
  SpotifyTopTracksResponse,
  SpotifyTopArtistsResponse,
  SpotifyPagingObject,
  SpotifyPlaylist,
  SpotifySavedTrack,
  SpotifyArtist,
  TimeRange,
} from '../types/spotify';

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

const MAX_RATE_LIMIT_RETRIES = 3;

async function spotifyFetch<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${SPOTIFY_BASE}${endpoint}`;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Rate limited — Spotify tells us how long to back off via Retry-After (seconds).
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterSec = Number(response.headers.get('Retry-After')) || 1;
      console.warn(`[spotify] 429 on ${endpoint} — retrying in ${retryAfterSec}s`);
      await sleep(Math.min(retryAfterSec, 30) * 1000);
      continue;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const message = (body['error'] as { message?: string } | undefined)?.message
        ?? response.statusText;

      throw new SpotifyApiError(response.status, message, endpoint);
    }

    // Some write endpoints return 201/204 with an empty body
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export async function getCurrentUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
  return spotifyFetch<SpotifyUserProfile>('/me', accessToken);
}

// ---------------------------------------------------------------------------
// Top items
// ---------------------------------------------------------------------------

export async function getUserTopTracks(
  accessToken: string,
  timeRange: TimeRange = 'medium_term',
  limit = 50
): Promise<SpotifyTopTracksResponse> {
  return spotifyFetch<SpotifyTopTracksResponse>(
    `/me/top/tracks?time_range=${timeRange}&limit=${Math.min(limit, 50)}`,
    accessToken
  );
}

export async function getUserTopArtists(
  accessToken: string,
  timeRange: TimeRange = 'medium_term',
  limit = 50
): Promise<SpotifyTopArtistsResponse> {
  return spotifyFetch<SpotifyTopArtistsResponse>(
    `/me/top/artists?time_range=${timeRange}&limit=${Math.min(limit, 50)}`,
    accessToken
  );
}

// ---------------------------------------------------------------------------
// Library / Saved tracks
// ---------------------------------------------------------------------------

export async function getSavedTracks(
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<SpotifyPagingObject<SpotifySavedTrack>> {
  return spotifyFetch<SpotifyPagingObject<SpotifySavedTrack>>(
    `/me/tracks?limit=${Math.min(limit, 50)}&offset=${offset}`,
    accessToken
  );
}

/**
 * Fetches ALL saved tracks across multiple pages.
 * Respects rate limits by adding a small delay between requests.
 * Caps at maxItems to avoid extremely long fetches (default: 500).
 */
export async function getAllSavedTracks(
  accessToken: string,
  maxItems = 500
): Promise<SpotifySavedTrack[]> {
  const allTracks: SpotifySavedTrack[] = [];
  let offset = 0;
  const limit = 50;

  while (allTracks.length < maxItems) {
    const page = await getSavedTracks(accessToken, limit, offset);
    allTracks.push(...page.items);

    if (!page.next || allTracks.length >= page.total) break;
    offset += limit;

    // Small delay to respect Spotify's rate limits (not needed often but polite)
    await sleep(100);
  }

  return allTracks.slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export async function getUserPlaylists(
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<SpotifyPagingObject<SpotifyPlaylist>> {
  return spotifyFetch<SpotifyPagingObject<SpotifyPlaylist>>(
    `/me/playlists?limit=${Math.min(limit, 50)}&offset=${offset}`,
    accessToken
  );
}

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

export async function getArtist(
  accessToken: string,
  artistId: string
): Promise<SpotifyArtist> {
  return spotifyFetch<SpotifyArtist>(`/artists/${artistId}`, accessToken);
}

/**
 * The batch endpoint GET /artists?ids= was removed for Development Mode apps
 * (Feb 2026), so artists are fetched one by one.
 */
export async function getArtists(
  accessToken: string,
  artistIds: string[]
): Promise<{ artists: SpotifyArtist[] }> {
  const artists = await mapWithConcurrency(artistIds.slice(0, 50), 4, id => getArtist(accessToken, id));
  return { artists };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SpotifySearchResult {
  tracks?: SpotifyPagingObject<import('../types/spotify').SpotifyTrack>;
  artists?: SpotifyPagingObject<SpotifyArtist>;
}

export async function search(
  accessToken: string,
  query: string,
  types: ('track' | 'artist')[],
  limit = 20
): Promise<SpotifySearchResult> {
  const type = types.join(',');
  const q = encodeURIComponent(query);
  // Development Mode caps search at limit=10 (Feb 2026); larger values are rejected.
  return spotifyFetch<SpotifySearchResult>(
    `/search?q=${q}&type=${type}&limit=${Math.max(1, Math.min(limit, 10))}`,
    accessToken
  );
}

// ---------------------------------------------------------------------------
// Phase 8: Playlists Creation & Modification
// ---------------------------------------------------------------------------

/**
 * Creates a playlist for the current user.
 * POST /users/{id}/playlists was removed for Development Mode apps (Feb 2026);
 * POST /me/playlists is the replacement.
 */
export async function createPlaylist(
  accessToken: string,
  name: string,
  description: string,
  isPublic = false
): Promise<SpotifyPlaylist> {
  return spotifyFetch<SpotifyPlaylist>(
    '/me/playlists',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        public: isPublic,
      }),
    }
  );
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[]
): Promise<{ snapshot_id: string }> {
  // Spotify allows max 100 URIs per batch
  const BATCH_SIZE = 100;
  let lastSnapshot = '';

  for (let i = 0; i < trackUris.length; i += BATCH_SIZE) {
    const batch = trackUris.slice(i, i + BATCH_SIZE);
    // /playlists/{id}/tracks was renamed to /items (Feb 2026)
    const res = await spotifyFetch<{ snapshot_id: string }>(
      `/playlists/${playlistId}/items`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ uris: batch }),
      }
    );
    lastSnapshot = res.snapshot_id;
  }

  return { snapshot_id: lastSnapshot };
}

export interface ResolvedTrackMatch {
  queryTitle: string;
  queryArtist: string;
  matched: boolean;
  trackId?: string;
  uri?: string;
  name?: string;
  artists?: string[];
  albumName?: string;
  albumImage?: string;
}

/**
 * Resolves "title + artist" suggestions (e.g. from Gemini) to real Spotify tracks.
 *
 * WHY strict matching: an LLM can suggest songs that don't exist. If we blindly
 * took the first search hit we would silently swap a hallucinated song for an
 * unrelated real one. Instead a candidate is accepted only when BOTH the title
 * and at least one artist match after normalization; otherwise it is reported
 * as unmatched so the UI can show it honestly.
 *
 * Normalization is Unicode-aware (accents stripped, non-Latin scripts kept), so
 * "Beyoncé", "Sigur Rós" or Hindi titles survive.
 */
export async function resolveTracks(
  accessToken: string,
  queries: Array<{ title: string; artist: string }>
): Promise<ResolvedTrackMatch[]> {
  return mapWithConcurrency(queries, 4, q => resolveOne(accessToken, q));
}

async function resolveOne(
  accessToken: string,
  q: { title: string; artist: string }
): Promise<ResolvedTrackMatch> {
  const unmatched: ResolvedTrackMatch = { queryTitle: q.title, queryArtist: q.artist, matched: false };
  const queryArtists = splitArtists(q.artist);
  const primaryArtist = queryArtists[0] ?? '';
  const title = stripTitleNoise(q.title);
  if (!title) return unmatched;

  // Field filters first (precise), then a plain keyword query (forgiving).
  const attempts = [
    primaryArtist ? `track:${title} artist:${primaryArtist}` : `track:${title}`,
    `${title} ${primaryArtist}`.trim(),
  ];

  for (const query of attempts) {
    try {
      const res = await search(accessToken, query, ['track'], 10);
      const best = (res.tracks?.items ?? []).find(t => isConfidentMatch(t, title, queryArtists));
      if (best) {
        return {
          queryTitle: q.title,
          queryArtist: q.artist,
          matched: true,
          trackId: best.id,
          uri: `spotify:track:${best.id}`,
          name: best.name,
          artists: best.artists.map(a => a.name),
          albumName: best.album?.name,
          albumImage: best.album?.images?.[1]?.url || best.album?.images?.[0]?.url,
        };
      }
    } catch (err) {
      // Auth/permission errors must surface; a single failed search should not.
      if (err instanceof SpotifyApiError && (err.statusCode === 401 || err.statusCode === 403)) throw err;
    }
  }

  return unmatched;
}

function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')            // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')  // keep letters/digits of any script
    .trim();
}

/** Removes "(feat. X)", "[Remastered]", " - Live at ..." etc. */
function stripTitleNoise(title: string): string {
  return title
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+(feat|ft)\.?\s+.*$/i, '')
    .replace(/["“”]/g, '')
    .trim();
}

function splitArtists(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b)\s*/i)
    .map(a => a.trim())
    .filter(Boolean);
}

function isConfidentMatch(
  track: import('../types/spotify').SpotifyTrack,
  wantedTitle: string,
  wantedArtists: string[]
): boolean {
  const want = normalize(wantedTitle);
  const got = normalize(stripTitleNoise(track.name));
  if (!want || !got) return false;
  const titleOk = got === want || got.startsWith(want) || want.startsWith(got);
  if (!titleOk) return false;
  if (wantedArtists.length === 0) return true;

  const trackArtists = track.artists.map(a => normalize(a.name));
  return wantedArtists.some(wa => {
    const w = normalize(wa);
    if (!w) return false;
    // Substring checks only for meaningful lengths, so "a" or "the" can't match everything
    return trackArtists.some(ta =>
      ta === w || (w.length >= 3 && ta.includes(w)) || (ta.length >= 3 && w.includes(ta)));
  });
}

/** Runs `fn` over items with at most `limit` in flight, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

export class SpotifyApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly endpoint: string
  ) {
    super(`Spotify API ${statusCode} at ${endpoint}: ${message}`);
    this.name = 'SpotifyApiError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
