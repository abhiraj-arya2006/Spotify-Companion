/**
 * services/music-dna.service.ts
 *
 * Phase 5 — Music DNA Engine
 *
 * Analyzes a user's cached Spotify data and produces a structured
 * "Music DNA" profile that captures their musical personality.
 *
 * Since audio-features (/v1/audio-features) is 403 for new apps,
 * we derive musical characteristics from what IS available:
 *   - Genre tags on top artists (rich genre vocabulary from Spotify)
 *   - Artist popularity scores (mainstream vs. underground taste)
 *   - Track popularity scores (is this person a chart follower?)
 *   - Time-range analysis (evolving taste vs. stable taste)
 *   - Artist diversity (monoculture vs. eclectic listener)
 *   - Save-to-top ratio (saver vs. streamer personality)
 *   - Era of music (old school vs. new releases)
 *   - Explicit track preference
 *   - Artist loyalty (same artists across all 3 time ranges = core favourites)
 */

import { getDb } from '../db/database';
import {
  getCachedTopTracks,
  getCachedTopArtists,
  getCachedSavedTracks,
  hasCachedData,
  type CachedArtist,
  type CachedTrack,
} from './sync.service';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface GenreProfile {
  name: string;
  score: number;    // weighted relevance 0–100
  count: number;    // how many artists contribute this genre
}

export interface ArtistProfile {
  artist_id: string;
  artist_name: string;
  image_url: string | null;
  genres: string[];
  popularity: number;
  loyaltyScore: number;  // 0–3 (appears in how many time ranges)
  isCoreFavourite: boolean;
}

export interface TrackProfile {
  track_id: string;
  track_name: string;
  artist_names: string[];
  album_image: string | null;
  popularity: number;
  source: 'top_short' | 'top_medium' | 'top_long' | 'saved';
}

export interface ListeningPersonality {
  type: string;         // e.g. "The Deep Diver"
  description: string;  // 2–3 sentences about their musical identity
  traits: string[];     // bullet-point characteristics
}

export interface GenreDrift {
  name: string;
  thenRank: number | null; // rank among all-time top genres (1-based), null = not in top list
  nowRank: number | null;  // rank among this month's top genres
}

export interface ShiftArtist {
  artist_id: string;
  artist_name: string;
  image_url: string | null;
  rank: number; // short-term rank for rising, long-term rank for fading
}

export interface TasteShift {
  genreDrift: GenreDrift[];        // genres in the top N of either era
  risingArtists: ShiftArtist[];    // in this month's top, absent from all-time
  fadingArtists: ShiftArtist[];    // all-time favourites missing from recent listening
  deepestCut: TrackProfile | null; // least-popular track in current rotation
}

export interface TasteSnapshot {
  date: string;
  archetype: string;
  mainstream: number;
  diversity: number;
  loyalty: number;
  evolving: number;
  topGenres: string[];
}

export interface MusicDNA {
  userId: string;
  generatedAt: number;

  // How taste has moved between all-time and right now
  taste: TasteShift;

  // Genre intelligence
  topGenres: GenreProfile[];           // top 15 weighted genres
  genreCategories: {                   // grouped higher-level buckets
    dominant: string[];
    secondary: string[];
    occasional: string[];
  };

  // Artist intelligence
  coreArtists: ArtistProfile[];        // appear across multiple time ranges
  currentFavourites: ArtistProfile[];  // short-term top (now)
  allTimeArtists: ArtistProfile[];     // long-term top (forever)
  artistDiversityScore: number;        // 0–100 (100 = extremely eclectic)

  // Track intelligence
  currentTopTracks: TrackProfile[];    // short-term top 20
  savedHighlights: TrackProfile[];     // top-popularity from saved library

  // Taste characteristics
  mainstreamScore: number;    // 0–100 (100 = only listens to chart hits)
  undergroundScore: number;   // 0–100 (100 = only underground artists)
  artistLoyaltyScore: number; // 0–100 (100 = listens to same artists always)
  evolvingTasteScore: number; // 0–100 (how different short vs long term is)
  savedLibrarySize: number;   // number of saved tracks synced

  // Listening personality
  listeningPersonality: ListeningPersonality;

  // Raw data counts
  dataQuality: {
    topArtistsCount: number;
    topTracksCount: number;
    savedTracksCount: number;
    lastSynced: number;
  };
}

// ---------------------------------------------------------------------------
// Main: generate Music DNA
// ---------------------------------------------------------------------------

export function generateMusicDNA(userId: string): MusicDNA | null {
  if (!hasCachedData(userId)) return null;

  const shortArtists  = getCachedTopArtists(userId, 'short_term');
  const mediumArtists = getCachedTopArtists(userId, 'medium_term');
  const longArtists   = getCachedTopArtists(userId, 'long_term');

  const shortTracks  = getCachedTopTracks(userId, 'short_term');
  const mediumTracks = getCachedTopTracks(userId, 'medium_term');
  const longTracks   = getCachedTopTracks(userId, 'long_term');
  const savedTracks  = getCachedSavedTracks(userId, 200);

  const allArtists = dedupArtists([...shortArtists, ...mediumArtists, ...longArtists]);
  const allTracks  = [...shortTracks, ...mediumTracks, ...longTracks];

  // --- Genre analysis ---
  const topGenres = analyzeGenres(shortArtists, mediumArtists, longArtists);

  // --- Artist profiles with loyalty ---
  const artistProfiles = buildArtistProfiles(shortArtists, mediumArtists, longArtists);
  const coreArtists    = artistProfiles.filter(a => a.loyaltyScore >= 2).slice(0, 15);
  const currentFavs    = artistProfiles.filter(a => shortArtists.some(s => s.artist_id === a.artist_id)).slice(0, 15);
  const allTimeArtsts  = artistProfiles.filter(a => longArtists.some(l => l.artist_id === a.artist_id)).slice(0, 15);

  // --- Scores ---
  const mainstreamScore    = calcMainstreamScore(allTracks, allArtists);
  const undergroundScore   = 100 - mainstreamScore;
  const artistDiversity    = calcArtistDiversity(allArtists);
  const artistLoyalty      = calcArtistLoyalty(shortArtists, longArtists);
  const evolvingTaste      = calcEvolvingTaste(shortArtists, longArtists);

  // --- Track selections ---
  const currentTopTracks = shortTracks.slice(0, 20).map(t => toTrackProfile(t, 'top_short'));
  const savedHighlights  = savedTracks
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 15)
    .map(t => toTrackProfile(t, 'saved'));

  // --- Personality ---
  const listeningPersonality = derivePersonality({
    mainstreamScore,
    artistDiversity,
    artistLoyalty,
    evolvingTaste,
    topGenres,
    savedLibrarySize: savedTracks.length,
  });

  const dna: MusicDNA = {
    userId,
    generatedAt: Date.now(),
    taste: analyzeTasteShift(shortArtists, mediumArtists, longArtists, [...shortTracks, ...mediumTracks]),
    topGenres: topGenres.slice(0, 15),
    genreCategories: categorizeGenres(topGenres),
    coreArtists,
    currentFavourites: currentFavs,
    allTimeArtists: allTimeArtsts,
    artistDiversityScore: artistDiversity,
    currentTopTracks,
    savedHighlights,
    mainstreamScore,
    undergroundScore,
    artistLoyaltyScore: artistLoyalty,
    evolvingTasteScore: evolvingTaste,
    savedLibrarySize: savedTracks.length,
    listeningPersonality,
    dataQuality: {
      topArtistsCount: allArtists.length,
      topTracksCount: allTracks.length,
      savedTracksCount: savedTracks.length,
      lastSynced: Date.now(),
    },
  };

  // Persist to DB
  persistMusicDNA(userId, dna);
  return dna;
}

// ---------------------------------------------------------------------------
// Genre analysis
// ---------------------------------------------------------------------------

function analyzeGenres(
  short: CachedArtist[],
  medium: CachedArtist[],
  long: CachedArtist[]
): GenreProfile[] {
  // Weight: short_term artists matter most (current taste), long_term least
  const weights = { short: 3, medium: 2, long: 1 };
  const genreScores: Map<string, { score: number; count: number }> = new Map();

  const addGenres = (artists: CachedArtist[], weight: number) => {
    artists.forEach((artist, i) => {
      // Top-ranked artists get a rank bonus (rank 1 = max bonus, rank 50 = minimal)
      const rankMultiplier = 1 + (artists.length - i) / artists.length;
      artist.genres.forEach(genre => {
        const normalized = normalizeGenre(genre);
        const existing = genreScores.get(normalized) ?? { score: 0, count: 0 };
        existing.score += weight * rankMultiplier;
        existing.count += 1;
        genreScores.set(normalized, existing);
      });
    });
  };

  addGenres(short, weights.short);
  addGenres(medium, weights.medium);
  addGenres(long, weights.long);

  // Normalize scores to 0–100
  const maxScore = Math.max(...Array.from(genreScores.values()).map(v => v.score), 1);

  return Array.from(genreScores.entries())
    .map(([name, { score, count }]) => ({
      name,
      score: Math.round((score / maxScore) * 100),
      count,
    }))
    .sort((a, b) => b.score - a.score);
}

// Cleans up Spotify's verbose genre tags like "indie pop rock" → "indie pop"
// and merges obvious duplicates
function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .replace(/\b(contemporary|modern|new|classic|neo|alternative|independent)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    || genre.toLowerCase();
}

function categorizeGenres(genres: GenreProfile[]): MusicDNA['genreCategories'] {
  const sorted = genres.slice();
  return {
    dominant:   sorted.slice(0, 3).map(g => g.name),
    secondary:  sorted.slice(3, 8).map(g => g.name),
    occasional: sorted.slice(8, 15).map(g => g.name),
  };
}

// ---------------------------------------------------------------------------
// Taste shift — all-time vs. this month
// ---------------------------------------------------------------------------

const DRIFT_TOP_N = 7;

function rankGenres(artists: CachedArtist[]): string[] {
  const scores = new Map<string, number>();
  artists.forEach((artist, i) => {
    const rankWeight = 1 + (artists.length - i) / artists.length;
    artist.genres.forEach(g => {
      const name = normalizeGenre(g);
      scores.set(name, (scores.get(name) ?? 0) + rankWeight);
    });
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

function analyzeTasteShift(
  short: CachedArtist[],
  medium: CachedArtist[],
  long: CachedArtist[],
  recentTracks: CachedTrack[]
): TasteShift {
  const thenTop = rankGenres(long).slice(0, DRIFT_TOP_N);
  const nowTop  = rankGenres(short).slice(0, DRIFT_TOP_N);
  const genreDrift: GenreDrift[] = [...new Set([...thenTop, ...nowTop])].map(name => ({
    name,
    thenRank: thenTop.includes(name) ? thenTop.indexOf(name) + 1 : null,
    nowRank:  nowTop.includes(name) ? nowTop.indexOf(name) + 1 : null,
  }));

  const toShift = (a: CachedArtist, rank: number): ShiftArtist => ({
    artist_id: a.artist_id,
    artist_name: a.artist_name,
    image_url: a.image_url,
    rank,
  });

  const longIds = new Set(long.map(a => a.artist_id));
  const recentIds = new Set([...short, ...medium].map(a => a.artist_id));

  const risingArtists = short
    .map((a, i) => ({ a, rank: i + 1 }))
    .filter(({ a }) => !longIds.has(a.artist_id))
    .slice(0, 6)
    .map(({ a, rank }) => toShift(a, rank));

  const fadingArtists = long
    .map((a, i) => ({ a, rank: i + 1 }))
    .filter(({ a }) => !recentIds.has(a.artist_id))
    .slice(0, 6)
    .map(({ a, rank }) => toShift(a, rank));

  // popularity 0 usually means a local file or missing data — ignore it
  const deepest = recentTracks
    .filter(t => (t.popularity ?? 0) > 0)
    .sort((a, b) => a.popularity - b.popularity)[0];

  return {
    genreDrift,
    risingArtists,
    fadingArtists,
    deepestCut: deepest ? toTrackProfile(deepest, 'top_short') : null,
  };
}

// ---------------------------------------------------------------------------
// Artist profiles
// ---------------------------------------------------------------------------

function buildArtistProfiles(
  short: CachedArtist[],
  medium: CachedArtist[],
  long: CachedArtist[]
): ArtistProfile[] {
  const shortIds  = new Set(short.map(a => a.artist_id));
  const mediumIds = new Set(medium.map(a => a.artist_id));
  const longIds   = new Set(long.map(a => a.artist_id));

  const all = dedupArtists([...short, ...medium, ...long]);

  return all.map(artist => {
    const loyaltyScore =
      (shortIds.has(artist.artist_id) ? 1 : 0) +
      (mediumIds.has(artist.artist_id) ? 1 : 0) +
      (longIds.has(artist.artist_id) ? 1 : 0);

    return {
      artist_id: artist.artist_id,
      artist_name: artist.artist_name,
      image_url: artist.image_url,
      genres: artist.genres,
      popularity: artist.popularity,
      loyaltyScore,
      isCoreFavourite: loyaltyScore >= 2,
    };
  }).sort((a, b) => b.loyaltyScore - a.loyaltyScore || b.popularity - a.popularity);
}

function dedupArtists(artists: CachedArtist[]): CachedArtist[] {
  const seen = new Set<string>();
  return artists.filter(a => {
    if (seen.has(a.artist_id)) return false;
    seen.add(a.artist_id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

function calcMainstreamScore(tracks: CachedTrack[], artists: CachedArtist[]): number {
  if (tracks.length === 0 && artists.length === 0) return 50;

  // Use valid positive popularity ratings
  const validTracks = tracks.filter(t => typeof t.popularity === 'number' && t.popularity > 0);
  const validArtists = artists.filter(a => typeof a.popularity === 'number' && a.popularity > 0);

  if (validTracks.length === 0 && validArtists.length === 0) {
    return 50;
  }

  const trackAvg = validTracks.length > 0
    ? validTracks.reduce((s, t) => s + t.popularity, 0) / validTracks.length
    : (validArtists.length > 0 ? validArtists.reduce((s, a) => s + a.popularity, 0) / validArtists.length : 50);

  const artistAvg = validArtists.length > 0
    ? validArtists.reduce((s, a) => s + a.popularity, 0) / validArtists.length
    : trackAvg;

  // Weighted: tracks 60%, artists 40%
  return Math.round(trackAvg * 0.6 + artistAvg * 0.4);
}

function calcArtistDiversity(artists: CachedArtist[]): number {
  if (artists.length === 0) return 0;

  const allGenres = artists.flatMap(a => a.genres);
  const uniqueGenres = new Set(allGenres).size;
  const genrePerArtist = uniqueGenres / artists.length;

  // A higher genre-per-artist ratio = more diverse
  // 1 genre/artist = very focused; 5+ genres/artist = eclectic
  return Math.min(100, Math.round(genrePerArtist * 20));
}

function calcArtistLoyalty(short: CachedArtist[], long: CachedArtist[]): number {
  if (short.length === 0 || long.length === 0) return 50;

  const longIds = new Set(long.map(a => a.artist_id));
  const overlap = short.filter(a => longIds.has(a.artist_id)).length;
  const minLen  = Math.min(short.length, long.length);

  return Math.round((overlap / minLen) * 100);
}

function calcEvolvingTaste(short: CachedArtist[], long: CachedArtist[]): number {
  // High evolving score = short and long term artists are very DIFFERENT
  return 100 - calcArtistLoyalty(short, long);
}

// ---------------------------------------------------------------------------
// Listening personality
// ---------------------------------------------------------------------------

interface PersonalityInputs {
  mainstreamScore: number;
  artistDiversity: number;
  artistLoyalty: number;
  evolvingTaste: number;
  topGenres: GenreProfile[];
  savedLibrarySize: number;
}

function derivePersonality(inputs: PersonalityInputs): ListeningPersonality {
  const { mainstreamScore, artistDiversity, artistLoyalty, evolvingTaste, topGenres } = inputs;

  const topGenreNames = topGenres.slice(0, 3).map(g => g.name).join(', ');

  // Determine personality archetype
  let type: string;
  let description: string;
  const traits: string[] = [];

  if (mainstreamScore >= 70 && artistDiversity < 40) {
    type = 'The Chart Surfer';
    description = `You ride the wave of popular music, gravitating toward what's trending. Your taste centres around ${topGenreNames}. You have a consistent, focused musical identity that rarely strays from familiar territory.`;
    traits.push('Prefers popular, well-known artists', 'Consistent genre focus', 'Likely discovers music through charts and playlists');
  } else if (mainstreamScore <= 35 && artistDiversity >= 60) {
    type = 'The Underground Explorer';
    description = `You actively seek out music that hasn't reached the mainstream yet, spanning ${topGenreNames}. You're the person whose friends ask for recommendations. Discovery is core to your musical identity.`;
    traits.push('Strong preference for underground and indie artists', 'Wide genre palette', 'Discovers music before it becomes popular');
  } else if (artistLoyalty >= 70 && evolvingTaste < 30) {
    type = 'The Devoted Fan';
    description = `You have a deep, unwavering commitment to your favourite artists across ${topGenreNames}. When you find an artist you love, you stay loyal across albums and years. Your library reflects depth over breadth.`;
    traits.push('Deep loyalty to core artists', 'Consistent taste over time', 'Likely follows artists through style changes');
  } else if (evolvingTaste >= 70) {
    type = 'The Taste Chameleon';
    description = `Your listening taste shifts significantly over time — your current favourites barely overlap with your long-term history. You're constantly reinventing your musical identity, moving through ${topGenreNames} and beyond.`;
    traits.push('Rapidly evolving taste', 'Mood-driven listening', 'Open to exploring new genres and artists');
  } else if (artistDiversity >= 60 && mainstreamScore >= 40) {
    type = 'The Eclectic Curator';
    description = `You effortlessly move between genres including ${topGenreNames}, finding quality music regardless of popularity or category. Your listening spans both mainstream and underground, united by a consistent sense of quality.`;
    traits.push('Wide genre range', 'Blends mainstream and underground', 'Curator mindset — quality over categorization');
  } else {
    type = 'The Melodic Enthusiast';
    description = `Your musical taste centres around ${topGenreNames}, with a balanced mix of popular and deeper cuts. You have clear preferences while remaining open to discovery within your comfort zone.`;
    traits.push('Balanced mainstream-to-underground ratio', 'Clear genre preferences', 'Appreciates both hits and deeper album cuts');
  }

  // Add universal insights
  if (inputs.savedLibrarySize > 150) traits.push('Active music saver — builds curated personal libraries');
  if (mainstreamScore < 50) traits.push('Gravitates toward underrated and niche artists');
  if (artistDiversity > 70) traits.push('Genuinely genre-agnostic listener');
  if (artistLoyalty > 60) traits.push('Builds long-term relationships with favourite artists');

  return { type, description, traits };
}

// ---------------------------------------------------------------------------
// Track profile helper
// ---------------------------------------------------------------------------

function toTrackProfile(track: CachedTrack, source: TrackProfile['source']): TrackProfile {
  return {
    track_id: track.track_id,
    track_name: track.track_name,
    artist_names: track.artist_names,
    album_image: track.album_image,
    popularity: track.popularity,
    source,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persistMusicDNA(userId: string, dna: MusicDNA): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO music_profiles (user_id, profile_json, last_synced_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      profile_json   = excluded.profile_json,
      last_synced_at = excluded.last_synced_at,
      updated_at     = excluded.updated_at
  `).run(userId, JSON.stringify(dna), dna.generatedAt, dna.generatedAt);

  // One snapshot per day: later regenerations on the same day overwrite it
  db.prepare(`
    INSERT INTO music_profile_history
      (user_id, snapshot_date, archetype, mainstream, diversity, loyalty, evolving, top_genres)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
      archetype  = excluded.archetype,
      mainstream = excluded.mainstream,
      diversity  = excluded.diversity,
      loyalty    = excluded.loyalty,
      evolving   = excluded.evolving,
      top_genres = excluded.top_genres
  `).run(
    userId,
    new Date(dna.generatedAt).toISOString().slice(0, 10),
    dna.listeningPersonality.type,
    dna.mainstreamScore,
    dna.artistDiversityScore,
    dna.artistLoyaltyScore,
    dna.evolvingTasteScore,
    JSON.stringify(dna.topGenres.slice(0, 5).map(g => g.name)),
  );
}

export function getMusicDnaHistory(userId: string, limit = 30): TasteSnapshot[] {
  const rows = getDb().prepare(`
    SELECT snapshot_date, archetype, mainstream, diversity, loyalty, evolving, top_genres
    FROM music_profile_history
    WHERE user_id = ?
    ORDER BY snapshot_date DESC
    LIMIT ?
  `).all(userId, limit) as Array<{
    snapshot_date: string; archetype: string; mainstream: number; diversity: number;
    loyalty: number; evolving: number; top_genres: string;
  }>;

  return rows.reverse().map(r => ({
    date: r.snapshot_date,
    archetype: r.archetype,
    mainstream: r.mainstream,
    diversity: r.diversity,
    loyalty: r.loyalty,
    evolving: r.evolving,
    topGenres: JSON.parse(r.top_genres) as string[],
  }));
}

export function getStoredMusicDNA(userId: string): MusicDNA | null {
  const db = getDb();
  const row = db.prepare('SELECT profile_json FROM music_profiles WHERE user_id = ?').get(userId) as
    { profile_json: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.profile_json) as MusicDNA;
}
