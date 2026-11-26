/**
 * services/user.service.ts
 *
 * Manages Spotify user profile persistence in SQLite.
 * Called after successful authentication to store/update the user record.
 */

import { getDb } from '../db/database';
import type { SpotifyUserProfile } from '../types/spotify';

export interface StoredUser {
  spotify_id: string;
  display_name: string | null;
  email: string;
  image_url: string | null;
  country: string;
  product: string;
  followers: number;
  created_at: number;
  updated_at: number;
}

export function upsertUser(profile: SpotifyUserProfile): StoredUser {
  const db = getDb();
  const now = Date.now();

  const imageUrl = profile.images[0]?.url ?? null;
  const displayName = profile.display_name ?? null;

  const stmt = db.prepare(`
    INSERT INTO users (spotify_id, display_name, email, image_url, country, product, followers, created_at, updated_at)
    VALUES (@spotifyId, @displayName, @email, @imageUrl, @country, @product, @followers, @now, @now)
    ON CONFLICT(spotify_id) DO UPDATE SET
      display_name = @displayName,
      email        = @email,
      image_url    = @imageUrl,
      country      = @country,
      product      = @product,
      followers    = @followers,
      updated_at   = @now
  `);

  stmt.run({
    spotifyId: profile.id,
    displayName,
    email: profile.email,
    imageUrl,
    country: profile.country,
    product: profile.product,
    followers: profile.followers.total,
    now,
  });

  return getUserById(profile.id) as StoredUser;
}

export function getUserById(spotifyId: string): StoredUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE spotify_id = ?').get(spotifyId);
  return (row as StoredUser) ?? null;
}
