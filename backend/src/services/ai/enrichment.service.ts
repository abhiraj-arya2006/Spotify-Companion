import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../db/database';
import { env } from '../../config/env';

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  return (_genAI ??= new GoogleGenerativeAI(env.gemini.apiKey));
}

/**
 * Enriches cached artist genres and popularity using Google Gemini when Spotify's Web API
 * omits them (which happens for development mode apps).
 * Results are cached in `artist_metadata_cache` so each artist is only queried once across all users.
 */
export async function enrichUserData(userId: string): Promise<void> {
  const db = getDb();

  // 1. Get unique artist names for this user that need enrichment (genres empty or popularity <= 0)
  const artistRows = db.prepare(`
    SELECT DISTINCT artist_name FROM cached_top_artists
    WHERE user_id = ? AND (genres = '[]' OR genres = '' OR popularity = 0 OR popularity IS NULL)
  `).all(userId) as Array<{ artist_name: string }>;

  if (artistRows.length === 0) return;

  const allNames = artistRows.map(r => r.artist_name);

  // Check which ones are already in artist_metadata_cache
  const cachedMeta = db.prepare(`
    SELECT artist_name, genres, popularity FROM artist_metadata_cache
  `).all() as Array<{ artist_name: string; genres: string; popularity: number }>;

  const cacheMap = new Map<string, { genres: string[]; popularity: number }>();
  for (const c of cachedMeta) {
    try {
      cacheMap.set(c.artist_name.toLowerCase(), {
        genres: JSON.parse(c.genres),
        popularity: c.popularity,
      });
    } catch {
      // ignore json parse error
    }
  }

  const missingNames: string[] = [];
  for (const name of allNames) {
    if (!cacheMap.has(name.toLowerCase())) {
      missingNames.push(name);
    }
  }

  // 2. Fetch missing artists from Gemini in batches
  if (missingNames.length > 0) {
    const genAI = getGenAI();
    const modelsToTry = [
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-pro-latest'
    ];

    const BATCH_SIZE = 35;
    for (let i = 0; i < missingNames.length; i += BATCH_SIZE) {
      const batch = missingNames.slice(i, i + BATCH_SIZE);
      const prompt = `Return a JSON array of objects for these musical artists. Each object must have:
- "name": string (exact artist name)
- "genres": string[] (up to 4 concise genre descriptors, e.g. ["Punjabi Pop", "Hip Hop"])
- "popularity": number (0 to 100 global Spotify popularity estimate, e.g. 95 for Arijit Singh/Drake, 75 for popular regional/indie, 35 for underground)

Artists:
${batch.join(', ')}`;

      let responseText: string | null = null;
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json' },
          });
          const result = await model.generateContent(prompt);
          responseText = result.response.text();
          if (responseText) break;
        } catch (err: any) {
          console.warn(`[enrichment] Model ${modelName} failed: ${err.message}`);
        }
      }

      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          const list: Array<{ name: string; genres: string[]; popularity: number }> = Array.isArray(parsed)
            ? parsed
            : (parsed.artists || []);

          const insertCache = db.prepare(`
            INSERT INTO artist_metadata_cache (artist_name, genres, popularity, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(artist_name) DO UPDATE SET
              genres = excluded.genres,
              popularity = excluded.popularity,
              updated_at = excluded.updated_at
          `);

          const insertTx = db.transaction((items: typeof list) => {
            for (const item of items) {
              if (!item.name) continue;
              const pop = typeof item.popularity === 'number' ? Math.max(0, Math.min(100, item.popularity)) : 50;
              const g = Array.isArray(item.genres) ? item.genres : [];
              insertCache.run(item.name, JSON.stringify(g), pop, Date.now());
              cacheMap.set(item.name.toLowerCase(), { genres: g, popularity: pop });
            }
          });

          insertTx(list);
        } catch (parseErr) {
          console.error('[enrichment] Failed to parse Gemini response:', parseErr);
        }
      }
    }
  }

  // 3. Update cached_top_artists with enriched data
  const updateArtist = db.prepare(`
    UPDATE cached_top_artists
    SET genres = ?, popularity = ?
    WHERE user_id = ? AND LOWER(artist_name) = ?
  `);

  const updateArtistTx = db.transaction(() => {
    for (const [nameLower, meta] of cacheMap.entries()) {
      updateArtist.run(JSON.stringify(meta.genres), meta.popularity, userId, nameLower);
    }
  });

  updateArtistTx();

  // 4. Update cached_top_tracks popularity using primary artist popularity
  const tracks = db.prepare(`
    SELECT track_id, artist_names, rank_position FROM cached_top_tracks
    WHERE user_id = ? AND (popularity IS NULL OR popularity = 0)
  `).all(userId) as Array<{ track_id: string; artist_names: string; rank_position: number }>;

  const updateTrack = db.prepare(`
    UPDATE cached_top_tracks
    SET popularity = ?
    WHERE user_id = ? AND track_id = ?
  `);

  const updateTrackTx = db.transaction(() => {
    for (const t of tracks) {
      let primaryArtist = '';
      try {
        const parsed = JSON.parse(t.artist_names);
        primaryArtist = parsed[0] || '';
      } catch {
        // ignore
      }

      const meta = cacheMap.get(primaryArtist.toLowerCase());
      if (meta) {
        // Adjust track popularity slightly by rank position (+5 for top 10, -5 for 40+)
        const rankOffset = t.rank_position <= 10 ? 5 : t.rank_position >= 40 ? -5 : 0;
        const trackPop = Math.max(5, Math.min(100, meta.popularity + rankOffset));
        updateTrack.run(trackPop, userId, t.track_id);
      } else {
        updateTrack.run(50, userId, t.track_id);
      }
    }
  });

  updateTrackTx();
  console.log(`[enrichment] Completed metadata enrichment for user: ${userId}`);
}
