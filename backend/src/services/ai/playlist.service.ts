/**
 * services/ai/playlist.service.ts
 *
 * Playlist Architect — turns a mood/concept prompt into a reviewable playlist
 * of REAL Spotify tracks.
 *
 * Pipeline:
 *   1. Build a compact taste context from cached Spotify data (Music DNA, top
 *      artists/tracks, saved tracks, explicit dislikes).
 *   2. Ask Gemini for structured JSON (responseSchema), not free text. We ask
 *      for more candidates than needed because some suggestions won't exist
 *      on Spotify (LLMs hallucinate song titles).
 *   3. Resolve every candidate against Spotify search with strict
 *      title+artist matching (see spotify.service resolveTracks).
 *   4. If too few matched, run ONE top-up round asking Gemini for replacements,
 *      excluding everything already tried.
 *   5. Return the first N matches in Gemini's intended order (preserving the
 *      energy arc) plus the unmatched list, so the UI can be honest about it.
 *
 * Nothing is written to Spotify here — export is a separate, user-confirmed step.
 *
 * WHY not the chat/tool-calling loop: a 50-track playlist through free-text
 * chat needs regex parsing, pollutes chat history, and lets the model decide
 * to create playlists on its own. A single structured call is faster,
 * deterministic to parse, and side-effect free.
 */

import { GoogleGenerativeAI, SchemaType, type GenerationConfig, type ResponseSchema } from '@google/generative-ai';
import { env } from '../../config/env';
import { getDb } from '../../db/database';
import { getCachedTopArtists, getCachedTopTracks, getCachedSavedTracks } from '../sync.service';
import { generateMusicDNA, getStoredMusicDNA } from '../music-dna.service';
import { resolveTracks, type ResolvedTrackMatch } from '../spotify.service';

export const MIN_TRACKS = 5;
export const MAX_TRACKS = 50;

/**
 * Model fallback chain (verified against this key's model list, Nov 2026).
 * The best model gets a short timeout: when it's overloaded Google can take
 * 90s+ just to return a 503, and Node's fetch gives up at 300s. The flash-lite
 * models return a full 50-track blueprint in roughly 5-15s.
 */
const MODELS: Array<{ name: string; timeoutMs: number }> = [
  { name: 'gemini-3.8-flash', timeoutMs: 45_000 },
  { name: 'gemini-3.5-flash-lite', timeoutMs: 60_000 },
  { name: 'gemini-flash-lite-latest', timeoutMs: 60_000 },
  { name: 'gemini-4-hydrogen', timeoutMs: 90_000 },
];

/** Simple circuit breaker: a model that just failed/timed out is skipped for a while. */
const MODEL_COOLDOWN_MS = 5 * 60_000;
const modelCooldownUntil = new Map<string, number>();

export type DiscoveryLevel = 'familiar' | 'balanced' | 'adventurous';

export interface GeneratePlaylistInput {
  userId: string;
  accessToken: string;
  prompt: string;
  trackCount: number;
  discoveryLevel?: DiscoveryLevel;
}

export interface PlaylistTrack {
  position: number;
  uri: string;
  trackId: string;
  name: string;
  artists: string[];
  albumName?: string;
  albumImage?: string;
  reason: string;
  energy: string;
}

export interface UnmatchedSuggestion {
  title: string;
  artist: string;
}

export interface PlaylistBlueprint {
  title: string;
  description: string;
  tracks: PlaylistTrack[];
  unmatched: UnmatchedSuggestion[];
  stats: { requested: number; matched: number; candidatesTried: number; model: string };
}

interface Candidate {
  title: string;
  artist: string;
  reason: string;
  energy: string;
}

interface GeminiPlaylist {
  title: string;
  description: string;
  tracks: Candidate[];
}

const PLAYLIST_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING, description: 'Evocative playlist name, max 60 chars' },
    description: { type: SchemaType.STRING, description: '1-2 sentence playlist description, max 250 chars' },
    tracks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING, description: 'Exact song title as released, without featured artists' },
          artist: { type: SchemaType.STRING, description: 'Primary credited artist, exactly as on Spotify' },
          reason: { type: SchemaType.STRING, description: 'One sentence: why this track fits (sound, mood, connection to user taste)' },
          energy: { type: SchemaType.STRING, description: 'Short arc label, e.g. "Opening calm", "Building", "Peak", "Comedown"' },
        },
        required: ['title', 'artist', 'reason', 'energy'],
      },
    },
  },
  required: ['title', 'description', 'tracks'],
};

let _genAI: GoogleGenerativeAI | null = null;
function genAI(): GoogleGenerativeAI {
  return (_genAI ??= new GoogleGenerativeAI(env.gemini.apiKey));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generatePlaylist(input: GeneratePlaylistInput): Promise<PlaylistBlueprint> {
  const trackCount = clamp(Math.round(input.trackCount), MIN_TRACKS, MAX_TRACKS);
  const discovery = input.discoveryLevel ?? 'balanced';
  const tasteContext = buildTasteContext(input.userId);

  // Ask for ~30% extra (min 5) to absorb suggestions that don't resolve.
  const firstAsk = trackCount + Math.max(5, Math.ceil(trackCount * 0.3));
  const first = await askGemini(buildPrompt({
    concept: input.prompt, count: firstAsk, discovery, tasteContext, exclude: [],
  }));

  const accepted: PlaylistTrack[] = [];
  const unmatched: UnmatchedSuggestion[] = [];
  const seenTrackIds = new Set<string>();
  const tried: Candidate[] = [];

  const absorb = async (candidates: Candidate[]) => {
    const fresh = dedupeCandidates(candidates, tried);
    tried.push(...fresh);
    const resolved = await resolveTracks(
      input.accessToken,
      fresh.map(c => ({ title: c.title, artist: c.artist }))
    );
    resolved.forEach((r, i) => {
      const c = fresh[i];
      if (isMatch(r) && !seenTrackIds.has(r.trackId) && accepted.length < trackCount) {
        seenTrackIds.add(r.trackId);
        accepted.push(toPlaylistTrack(r, c, accepted.length + 1));
      } else if (!r.matched) {
        unmatched.push({ title: c.title, artist: c.artist });
      }
    });
  };

  await absorb(first.data.tracks);

  // One top-up round if we're short (e.g. many hallucinated titles).
  if (accepted.length < trackCount) {
    const missing = trackCount - accepted.length;
    try {
      const topUp = await askGemini(buildPrompt({
        concept: input.prompt,
        count: missing + Math.max(5, Math.ceil(missing * 0.5)),
        discovery,
        tasteContext,
        exclude: tried.map(c => `${c.title} — ${c.artist}`),
        continuation: accepted.slice(-3).map(t => `${t.name} — ${t.artists[0]}`),
      }));
      await absorb(topUp.data.tracks);
    } catch (err) {
      // Top-up is best effort; return what we have rather than failing the request.
      console.warn('[playlist] top-up round failed:', err instanceof Error ? err.message : err);
    }
  }

  if (accepted.length === 0) {
    throw new PlaylistGenerationError('None of the suggested tracks could be found on Spotify. Try rephrasing the prompt.');
  }

  return {
    title: first.data.title.trim().slice(0, 100) || 'Companion AI Playlist',
    description: first.data.description.trim().slice(0, 300),
    tracks: accepted,
    unmatched,
    stats: { requested: trackCount, matched: accepted.length, candidatesTried: tried.length, model: first.model },
  };
}

export class PlaylistGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistGenerationError';
  }
}

// ---------------------------------------------------------------------------
// Gemini call with model fallback + JSON validation
// ---------------------------------------------------------------------------

async function askGemini(prompt: string): Promise<{ data: GeminiPlaylist; model: string }> {
  let lastErr: unknown;
  const now = Date.now();
  const available = MODELS.filter(m => (modelCooldownUntil.get(m.name) ?? 0) <= now);
  // If every model is cooling down, try them all anyway rather than failing outright.
  for (const { name: modelName, timeoutMs } of available.length ? available : MODELS) {
    try {
      const model = genAI().getGenerativeModel(
        {
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: PLAYLIST_SCHEMA,
            temperature: 0.9,
            // Song lists need knowledge, not deep reasoning; "low" thinking cuts
            // latency a lot. Not in SDK 0.21's types, but passed through to the API.
            thinkingConfig: { thinkingLevel: 'low' },
          } as GenerationConfig,
        },
        { timeout: timeoutMs }
      );
      const t0 = Date.now();
      const result = await model.generateContent(prompt);
      console.log(`[playlist] ${modelName} responded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      const data = parsePlaylistJson(result.response.text());
      return { data, model: modelName };
    } catch (err) {
      lastErr = err;
      modelCooldownUntil.set(modelName, Date.now() + MODEL_COOLDOWN_MS);
      console.warn(`[playlist] model ${modelName} failed (skipping it for 5 min): ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new PlaylistGenerationError(
    `AI service unavailable: ${lastErr instanceof Error ? lastErr.message : 'all models failed'}`
  );
}

function parsePlaylistJson(text: string): GeminiPlaylist {
  const raw = JSON.parse(text) as Partial<GeminiPlaylist>;
  const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  const clean = tracks
    .filter((t): t is Candidate => !!t && typeof t.title === 'string' && typeof t.artist === 'string')
    .map(t => ({
      title: t.title.trim(),
      artist: t.artist.trim(),
      reason: typeof t.reason === 'string' ? t.reason.trim() : '',
      energy: typeof t.energy === 'string' ? t.energy.trim() : '',
    }))
    .filter(t => t.title && t.artist);
  if (clean.length === 0) throw new Error('Model returned no tracks');
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    tracks: clean,
  };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const DISCOVERY_GUIDE: Record<DiscoveryLevel, string> = {
  familiar: 'About 60% of tracks should be by artists the user already listens to (from the taste profile), 40% closely related discoveries.',
  balanced: 'About 30% of tracks may be by artists the user already listens to; the remaining 70% should be discoveries that fit their taste.',
  adventurous: 'At most 10% of tracks by artists the user already listens to. Favour lesser-known, underrated artists and deep cuts that still fit their taste.',
};

function buildPrompt(opts: {
  concept: string;
  count: number;
  discovery: DiscoveryLevel;
  tasteContext: string;
  exclude: string[];
  continuation?: string[];
}): string {
  const lines = [
    'You are Playlist Architect, an expert music curator.',
    `Design a playlist of exactly ${opts.count} tracks for this concept: "${opts.concept}"`,
    '',
    'USER TASTE PROFILE (from their real Spotify data):',
    opts.tasteContext,
    '',
    'RULES:',
    '- Only suggest real, officially released songs that are available on Spotify. Use the exact released title and the primary credited artist. Never invent songs.',
    '- No duplicate songs. Maximum 3 songs per artist.',
    `- ${DISCOVERY_GUIDE[opts.discovery]}`,
    '- Order tracks deliberately: a clear energy/atmosphere arc (opening, build, peak, comedown) rather than a random list.',
    '- Respect the concept over the taste profile when they conflict, but keep the user\'s sensibility.',
    '- Never include artists or songs the user dislikes.',
    '- "reason" must be specific (instrumentation, vocals, mood, tempo, or connection to an artist they love), not generic praise.',
  ];
  if (opts.continuation?.length) {
    lines.push(
      '',
      `These tracks will be APPENDED to an existing playlist that currently ends with: ${opts.continuation.join('; ')}.`,
      'Continue the arc naturally from there.'
    );
  }
  if (opts.exclude.length) {
    lines.push('', 'Do NOT suggest any of these (already used or not found on Spotify):', opts.exclude.join('\n'));
  }
  return lines.join('\n');
}

function buildTasteContext(userId: string): string {
  const parts: string[] = [];

  let dna = getStoredMusicDNA(userId);
  if (!dna) {
    try { dna = generateMusicDNA(userId); } catch { dna = null; }
  }
  if (dna) {
    parts.push(`Listening personality: ${dna.listeningPersonality.type}`);
    if (dna.topGenres?.length) parts.push(`Top genres: ${dna.topGenres.slice(0, 10).map(g => g.name).join(', ')}`);
  }

  const artists = dedupe([
    ...getCachedTopArtists(userId, 'short_term'),
    ...getCachedTopArtists(userId, 'medium_term'),
    ...getCachedTopArtists(userId, 'long_term'),
  ].map(a => a.artist_name)).slice(0, 30);
  if (artists.length) parts.push(`Favourite artists: ${artists.join(', ')}`);

  const tracks = dedupe([
    ...getCachedTopTracks(userId, 'short_term'),
    ...getCachedTopTracks(userId, 'medium_term'),
  ].map(t => `${t.track_name} — ${t.artist_names[0] ?? ''}`)).slice(0, 25);
  if (tracks.length) parts.push(`Recent top tracks: ${tracks.join('; ')}`);

  const saved = getCachedSavedTracks(userId, 15).map(t => `${t.track_name} — ${t.artist_names[0] ?? ''}`);
  if (saved.length) parts.push(`Recently saved: ${saved.join('; ')}`);

  const dislikes = getDislikes(userId);
  if (dislikes.length) parts.push(`Dislikes (avoid): ${dislikes.join(', ')}`);

  return parts.length
    ? parts.join('\n')
    : 'No listening data synced yet — rely on the concept alone and say nothing about the user\'s history.';
}

function getDislikes(userId: string): string[] {
  try {
    const rows = getDb().prepare(`
      SELECT context FROM recommendation_feedback
      WHERE user_id = ? AND feedback_type = 'dislike' AND context IS NOT NULL
      ORDER BY created_at DESC LIMIT 20
    `).all(userId) as Array<{ context: string }>;
    return rows.map(r => r.context);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MatchedResolution = ResolvedTrackMatch & { matched: true; trackId: string; uri: string };

function isMatch(r: ResolvedTrackMatch): r is MatchedResolution {
  return r.matched && !!r.trackId && !!r.uri;
}

function toPlaylistTrack(r: MatchedResolution, c: Candidate, position: number): PlaylistTrack {
  return {
    position,
    uri: r.uri,
    trackId: r.trackId,
    name: r.name ?? c.title,
    artists: r.artists ?? [c.artist],
    albumName: r.albumName,
    albumImage: r.albumImage,
    reason: c.reason,
    energy: c.energy,
  };
}

function candidateKey(c: { title: string; artist: string }): string {
  return `${c.title}|${c.artist}`.toLowerCase().replace(/\s+/g, ' ');
}

function dedupeCandidates(candidates: Candidate[], alreadyTried: Candidate[]): Candidate[] {
  const seen = new Set(alreadyTried.map(candidateKey));
  return candidates.filter(c => {
    const k = candidateKey(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}
