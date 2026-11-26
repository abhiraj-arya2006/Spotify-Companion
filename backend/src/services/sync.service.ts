/**
 * services/sync.service.ts
 *
 * Phase 4 — Spotify Data Integration
 *
 * Fetches all available Spotify data for a user and caches it in SQLite.
 * This runs after login and can be re-triggered to refresh data.
 *
 * What we sync:
 * - Top tracks × 3 time ranges (short/medium/long term) = up to 150 tracks
 * - Top artists × 3 time ranges = up to 150 artists
 * - Saved library tracks (up to 200, paginated)
 *
 * Why cache locally?
 * - Spotify rate limits: 429 responses if we hit the API too often
 * - Music DNA analysis needs the full dataset without 3+ round trips per request
 * - AI chat can answer questions about the user's data instantly from SQLite
 */

import { getDb } from '../db/database';
import {
  getUserTopTracks,
  getUserTopArtists,
  getAllSavedTracks,
} from './spotify.service';
import type { SpotifyTrack, SpotifyArtist, SpotifySavedTrack, TimeRange } from '../types/spotify';

const TIME_RANGES: TimeRange[] = ['short_term', 'medium_term', 'long_term'];

// ---------------------------------------------------------------------------
// Main sync function — called after login and on-demand refresh
// ---------------------------------------------------------------------------

export interface SyncResult {
  success: boolean;
  itemsSynced: {
    topTracks: number;
    topArtists: number;
    savedTracks: number;
  };
  errors: string[];
  durationMs: number;
}

export async function syncUserData(
  userId: string,
  accessToken: string
): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  const counts = { topTracks: 0, topArtists: 0, savedTracks: 0 };

  console.log(`[sync] Starting data sync for user: ${userId}`);

  // Run all syncs in parallel where safe; use sequential for rate-limit safety
  // Top tracks and top artists can run concurrently across time ranges
  const topTrackPromises = TIME_RANGES.map(range =>
    syncTopTracks(userId, accessToken, range)
      .then(n => { counts.topTracks += n; })
      .catch(e => { errors.push(`top_tracks_${range}: ${e.message}`); })
  );

  const topArtistPromises = TIME_RANGES.map(range =>
    syncTopArtists(userId, accessToken, range)
      .then(n => { counts.topArtists += n; })
      .catch(e => { errors.push(`top_artists_${range}: ${e.message}`); })
  );

  // Run track + artist fetches concurrently, then saved tracks (sequential to avoid rate limits)
  await Promise.all([...topTrackPromises, ...topArtistPromises]);

  // Saved tracks after the above to stay within rate limits
  await syncSavedTracks(userId, accessToken)
    .then(n => { counts.savedTracks = n; })
    .catch(e => { errors.push(`saved_tracks: ${e.message}`); });

  const durationMs = Date.now() - start;
  const success = errors.length === 0;

  logSync(userId, 'full_sync', success ? 'success' : 'partial',
    counts.topTracks + counts.topArtists + counts.savedTracks,
    errors.join('; ') || undefined);

  console.log(`[sync] Completed in ${durationMs}ms. Tracks: ${counts.topTracks}, Artists: ${counts.topArtists}, Saved: ${counts.savedTracks}. Errors: ${errors.length}`);

  return { success, itemsSynced: counts, errors, durationMs };
}

// ---------------------------------------------------------------------------
// Top Tracks
// ---------------------------------------------------------------------------

async function syncTopTracks(
  userId: string,
  accessToken: string,
  timeRange: TimeRange
): Promise<number> {
  const response = await getUserTopTracks(accessToken, timeRange, 50);
  const tracks = response.items;

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO cached_top_tracks
      (user_id, time_range, rank_position, track_id, track_name,
       artist_ids, artist_names, album_name, album_image,
       popularity, duration_ms, explicit, preview_url, spotify_url, synced_at)
    VALUES
      (@userId, @timeRange, @rankPosition, @trackId, @trackName,
       @artistIds, @artistNames, @albumName, @albumImage,
       @popularity, @durationMs, @explicit, @previewUrl, @spotifyUrl, @syncedAt)
    ON CONFLICT(user_id, time_range, track_id) DO UPDATE SET
      rank_position = @rankPosition,
      popularity    = @popularity,
      synced_at     = @syncedAt
  `);

  const upsertMany = db.transaction((items: SpotifyTrack[]) => {
    items.forEach((track, i) => {
      insert.run({
        userId,
        timeRange,
        rankPosition: i + 1,
        trackId: track.id,
        trackName: track.name,
        artistIds: JSON.stringify(track.artists.map(a => a.id)),
        artistNames: JSON.stringify(track.artists.map(a => a.name)),
        albumName: track.album.name,
        albumImage: track.album.images[1]?.url ?? track.album.images[0]?.url ?? null,
        popularity: track.popularity,
        durationMs: track.duration_ms,
        explicit: track.explicit ? 1 : 0,
        previewUrl: track.preview_url ?? null,
        spotifyUrl: track.external_urls.spotify,
        syncedAt: Date.now(),
      });
    });
  });

  upsertMany(tracks);
  logSync(userId, `top_tracks_${timeRange}`, 'success', tracks.length);
  return tracks.length;
}

// ---------------------------------------------------------------------------
// Top Artists
// ---------------------------------------------------------------------------

async function syncTopArtists(
  userId: string,
  accessToken: string,
  timeRange: TimeRange
): Promise<number> {
  const response = await getUserTopArtists(accessToken, timeRange, 50);
  const artists = response.items;

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO cached_top_artists
      (user_id, time_range, rank_position, artist_id, artist_name,
       genres, popularity, followers, image_url, spotify_url, synced_at)
    VALUES
      (@userId, @timeRange, @rankPosition, @artistId, @artistName,
       @genres, @popularity, @followers, @imageUrl, @spotifyUrl, @syncedAt)
    ON CONFLICT(user_id, time_range, artist_id) DO UPDATE SET
      rank_position = @rankPosition,
      genres        = @genres,
      popularity    = @popularity,
      followers     = @followers,
      synced_at     = @syncedAt
  `);

  const upsertMany = db.transaction((items: SpotifyArtist[]) => {
    items.forEach((artist, i) => {
      insert.run({
        userId,
        timeRange,
        rankPosition: i + 1,
        artistId: artist.id,
        artistName: artist.name,
        genres: JSON.stringify(artist.genres ?? []),
        popularity: artist.popularity ?? 0,
        followers: artist.followers?.total ?? 0,
        imageUrl: artist.images?.[1]?.url ?? artist.images?.[0]?.url ?? null,
        spotifyUrl: artist.external_urls?.spotify ?? '',
        syncedAt: Date.now(),
      });
    });
  });

  upsertMany(artists);
  logSync(userId, `top_artists_${timeRange}`, 'success', artists.length);
  return artists.length;
}

// ---------------------------------------------------------------------------
// Saved Library Tracks
// ---------------------------------------------------------------------------

async function syncSavedTracks(
  userId: string,
  accessToken: string
): Promise<number> {
  // Sample up to 200 saved tracks for DNA analysis
  const savedTracks = await getAllSavedTracks(accessToken, 200);

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO cached_saved_tracks
      (user_id, track_id, track_name, artist_ids, artist_names,
       album_name, album_image, added_at, popularity, duration_ms,
       explicit, spotify_url, synced_at)
    VALUES
      (@userId, @trackId, @trackName, @artistIds, @artistNames,
       @albumName, @albumImage, @addedAt, @popularity, @durationMs,
       @explicit, @spotifyUrl, @syncedAt)
    ON CONFLICT(user_id, track_id) DO UPDATE SET
      added_at  = @addedAt,
      synced_at = @syncedAt
  `);

  const upsertMany = db.transaction((items: SpotifySavedTrack[]) => {
    items.forEach(({ track, added_at }) => {
      insert.run({
        userId,
        trackId: track.id,
        trackName: track.name,
        artistIds: JSON.stringify(track.artists.map(a => a.id)),
        artistNames: JSON.stringify(track.artists.map(a => a.name)),
        albumName: track.album.name,
        albumImage: track.album.images[1]?.url ?? track.album.images[0]?.url ?? null,
        addedAt: added_at,
        popularity: track.popularity,
        durationMs: track.duration_ms,
        explicit: track.explicit ? 1 : 0,
        spotifyUrl: track.external_urls.spotify,
        syncedAt: Date.now(),
      });
    });
  });

  upsertMany(savedTracks);
  logSync(userId, 'saved_tracks', 'success', savedTracks.length);
  return savedTracks.length;
}

// ---------------------------------------------------------------------------
// Sync log helpers
// ---------------------------------------------------------------------------

function logSync(
  userId: string,
  dataType: string,
  status: 'success' | 'error' | 'partial',
  itemsCount: number,
  errorMsg?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_log (user_id, data_type, status, items_count, error_msg, synced_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, dataType, status, itemsCount, errorMsg ?? null, Date.now());
}

// ---------------------------------------------------------------------------
// Query helpers — used by Music DNA and AI tools
// ---------------------------------------------------------------------------

export interface CachedTrack {
  rank_position: number;
  track_id: string;
  track_name: string;
  artist_ids: string[];   // parsed from JSON
  artist_names: string[]; // parsed from JSON
  album_name: string;
  album_image: string | null;
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  spotify_url: string;
  time_range?: string;
}

export interface CachedArtist {
  rank_position: number;
  artist_id: string;
  artist_name: string;
  genres: string[];        // parsed from JSON
  popularity: number;
  followers: number;
  image_url: string | null;
  spotify_url: string;
  time_range?: string;
}

export function getCachedTopTracks(userId: string, timeRange: TimeRange): CachedTrack[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM cached_top_tracks
    WHERE user_id = ? AND time_range = ?
    ORDER BY rank_position ASC
  `).all(userId, timeRange) as Array<Record<string, unknown>>;

  return rows.map(parseTrackRow);
}

export function getCachedTopArtists(userId: string, timeRange: TimeRange): CachedArtist[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM cached_top_artists
    WHERE user_id = ? AND time_range = ?
    ORDER BY rank_position ASC
  `).all(userId, timeRange) as Array<Record<string, unknown>>;

  return rows.map(parseArtistRow);
}

export function getCachedSavedTracks(userId: string, limit = 200): CachedTrack[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT *, 0 as rank_position FROM cached_saved_tracks
    WHERE user_id = ?
    ORDER BY added_at DESC
    LIMIT ?
  `).all(userId, limit) as Array<Record<string, unknown>>;

  return rows.map(parseTrackRow);
}

export function getLastSyncTime(userId: string): number | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(synced_at) as last_sync FROM sync_log
    WHERE user_id = ? AND data_type = 'full_sync' AND status IN ('success','partial')
  `).get(userId) as { last_sync: number | null } | undefined;
  return row?.last_sync ?? null;
}

export function hasCachedData(userId: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM cached_top_artists WHERE user_id = ?
  `).get(userId) as { count: number };
  return row.count > 0;
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------

function parseTrackRow(row: Record<string, unknown>): CachedTrack {
  return {
    rank_position: row['rank_position'] as number,
    track_id: row['track_id'] as string,
    track_name: row['track_name'] as string,
    artist_ids: JSON.parse(row['artist_ids'] as string) as string[],
    artist_names: JSON.parse(row['artist_names'] as string) as string[],
    album_name: row['album_name'] as string,
    album_image: row['album_image'] as string | null,
    popularity: row['popularity'] as number,
    duration_ms: row['duration_ms'] as number,
    explicit: Boolean(row['explicit']),
    preview_url: row['preview_url'] as string | null,
    spotify_url: row['spotify_url'] as string,
    time_range: row['time_range'] as string | undefined,
  };
}

function parseArtistRow(row: Record<string, unknown>): CachedArtist {
  return {
    rank_position: row['rank_position'] as number,
    artist_id: row['artist_id'] as string,
    artist_name: row['artist_name'] as string,
    genres: JSON.parse(row['genres'] as string) as string[],
    popularity: row['popularity'] as number,
    followers: row['followers'] as number,
    image_url: row['image_url'] as string | null,
    spotify_url: row['spotify_url'] as string,
    time_range: row['time_range'] as string | undefined,
  };
}
