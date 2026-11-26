/**
 * db/database.ts
 *
 * SQLite database initialization and schema management.
 *
 * WHY SQLITE?
 * This is a single-user personal tool. SQLite is:
 * - Zero-infrastructure (a single file)
 * - Persistent across server restarts (unlike in-memory sessions)
 * - Fast enough for all our use cases
 * - Easy to migrate to PostgreSQL later if needed
 *
 * Token security note:
 * Tokens are stored unencrypted at the OS filesystem level.
 * For a personal development tool on your own machine, this is acceptable.
 * For a multi-user production deployment, tokens should be encrypted at rest.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Store the database file in a `data/` directory inside the backend folder
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'spotify-companion.db');

// Ensure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH, {
    // Verbose logging in development — logs SQL statements
    verbose: process.env.NODE_ENV === 'development' ? undefined : undefined,
  });

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  // Enforce foreign key constraints
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  console.log(`[db] SQLite database ready at: ${DB_PATH}`);

  return _db;
}

function initSchema(db: Database.Database): void {
  // Users table — stores Spotify profile info
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      spotify_id    TEXT PRIMARY KEY,
      display_name  TEXT,
      email         TEXT,
      image_url     TEXT,
      country       TEXT,
      product       TEXT,
      followers     INTEGER DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  // Tokens table — stores OAuth tokens linked to a user
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT NOT NULL UNIQUE,
      access_token   TEXT NOT NULL,
      refresh_token  TEXT NOT NULL,
      expires_at     INTEGER NOT NULL,
      scope          TEXT NOT NULL,
      obtained_at    INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Music profile table — stores computed Music DNA (Phase 5)
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_profiles (
      user_id         TEXT PRIMARY KEY,
      profile_json    TEXT NOT NULL DEFAULT '{}',
      last_synced_at  INTEGER,
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Feedback table — stores user reactions to recommendations (Phase 5-6)
  db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_feedback (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         TEXT NOT NULL,
      spotify_track_id TEXT,
      spotify_artist_id TEXT,
      feedback_type   TEXT NOT NULL CHECK(feedback_type IN ('like', 'dislike', 'neutral', 'save')),
      context         TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Cached Spotify top tracks (3 time ranges × up to 50 tracks each)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_top_tracks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT NOT NULL,
      time_range    TEXT NOT NULL CHECK(time_range IN ('short_term','medium_term','long_term')),
      rank_position INTEGER NOT NULL,
      track_id      TEXT NOT NULL,
      track_name    TEXT NOT NULL,
      artist_ids    TEXT NOT NULL,  -- JSON array of artist IDs
      artist_names  TEXT NOT NULL,  -- JSON array of artist names
      album_name    TEXT NOT NULL,
      album_image   TEXT,
      popularity    INTEGER,
      duration_ms   INTEGER,
      explicit      INTEGER DEFAULT 0,
      preview_url   TEXT,
      spotify_url   TEXT,
      synced_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(user_id, time_range, track_id),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Cached Spotify top artists
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_top_artists (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT NOT NULL,
      time_range    TEXT NOT NULL CHECK(time_range IN ('short_term','medium_term','long_term')),
      rank_position INTEGER NOT NULL,
      artist_id     TEXT NOT NULL,
      artist_name   TEXT NOT NULL,
      genres        TEXT NOT NULL,  -- JSON array of genre strings
      popularity    INTEGER,
      followers     INTEGER,
      image_url     TEXT,
      spotify_url   TEXT,
      synced_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(user_id, time_range, artist_id),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Cached saved library tracks (sampled, not full library)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_saved_tracks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT NOT NULL,
      track_id      TEXT NOT NULL,
      track_name    TEXT NOT NULL,
      artist_ids    TEXT NOT NULL,  -- JSON array
      artist_names  TEXT NOT NULL,  -- JSON array
      album_name    TEXT NOT NULL,
      album_image   TEXT,
      added_at      TEXT,           -- ISO date when user saved it
      popularity    INTEGER,
      duration_ms   INTEGER,
      explicit      INTEGER DEFAULT 0,
      spotify_url   TEXT,
      synced_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(user_id, track_id),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Sync metadata — tracks when each data type was last fetched
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      data_type   TEXT NOT NULL,   -- 'top_tracks_short', 'top_artists_medium', 'saved_tracks', etc.
      status      TEXT NOT NULL CHECK(status IN ('success','error','partial')),
      items_count INTEGER DEFAULT 0,
      error_msg   TEXT,
      synced_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Conversation history for AI chat (Phase 6)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      session_id  TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('user','model')),
      content     TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(spotify_id) ON DELETE CASCADE
    )
  `);

  // Create indexes for query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_top_tracks_user_range ON cached_top_tracks(user_id, time_range);
    CREATE INDEX IF NOT EXISTS idx_top_artists_user_range ON cached_top_artists(user_id, time_range);
    CREATE INDEX IF NOT EXISTS idx_saved_tracks_user ON cached_saved_tracks(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(user_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_sync_log_user ON sync_log(user_id, data_type);
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
