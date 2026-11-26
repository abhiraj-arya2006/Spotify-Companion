/**
 * services/ai/gemini.service.ts
 *
 * Phase 6 — Gemini AI Integration with Function Calling
 *
 * Architecture: Gemini acts as the conversational intelligence, with access
 * to a set of "tools" that query the user's real Spotify data from SQLite.
 * This means Gemini can answer questions like:
 *   - "What genres do I listen to most?"
 *   - "Recommend artists similar to my top artists"
 *   - "Create a midnight driving playlist from my taste"
 *
 * Function calling flow:
 * 1. User sends a message
 * 2. We pass it to Gemini along with available tool definitions
 * 3. Gemini decides which tools to call (if any)
 * 4. We execute the tool calls against our SQLite cache / Spotify API
 * 5. Results are returned to Gemini
 * 6. Gemini synthesizes a final response
 *
 * This is the correct architecture — Gemini never has direct database access.
 * It requests data through typed tool interfaces that we control.
 */

import { GoogleGenerativeAI, type Part, type Content, type FunctionDeclaration, type Tool } from '@google/generative-ai';
import { env } from '../../config/env';
import { getDb } from '../../db/database';
import {
  getCachedTopTracks,
  getCachedTopArtists,
  getCachedSavedTracks,
  type CachedArtist,
  type CachedTrack,
} from '../sync.service';
import { generateMusicDNA, getStoredMusicDNA } from '../music-dna.service';

// ---------------------------------------------------------------------------
// Gemini client (singleton)
// ---------------------------------------------------------------------------

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(env.gemini.apiKey);
  }
  return _genAI;
}

// ---------------------------------------------------------------------------
// Tool definitions — what Gemini can ask our backend to do
// ---------------------------------------------------------------------------

const MUSIC_TOOLS: Tool = {
  functionDeclarations: [
    {
      name: 'get_user_top_artists',
      description: 'Get the user\'s top Spotify artists. Use time_range to specify the period: short_term (last 4 weeks), medium_term (last 6 months), or long_term (all time). Returns artist names, genres, and popularity.',
      parameters: {
        type: 'object' as const,
        properties: {
          time_range: {
            type: 'string' as const,
            enum: ['short_term', 'medium_term', 'long_term'],
            description: 'The time period for top artists',
          },
          limit: {
            type: 'number' as const,
            description: 'Number of artists to return (1-50, default 20)',
          },
        },
        required: ['time_range'],
      },
    } as FunctionDeclaration,
    {
      name: 'get_user_top_tracks',
      description: 'Get the user\'s top Spotify tracks. Returns track names, artists, and album info.',
      parameters: {
        type: 'object' as const,
        properties: {
          time_range: {
            type: 'string' as const,
            enum: ['short_term', 'medium_term', 'long_term'],
            description: 'The time period for top tracks',
          },
          limit: {
            type: 'number' as const,
            description: 'Number of tracks to return (1-50, default 20)',
          },
        },
        required: ['time_range'],
      },
    } as FunctionDeclaration,
    {
      name: 'get_music_dna',
      description: 'Get the user\'s full Music DNA profile — their genre preferences, listening personality type, mainstream vs underground taste score, artist diversity score, core favourite artists, and listening traits. Use this to understand who the user is musically before making recommendations.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    } as FunctionDeclaration,
    {
      name: 'get_saved_tracks',
      description: 'Get tracks the user has saved to their Spotify library. Good for understanding long-term taste beyond just what they\'ve been playing recently.',
      parameters: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number' as const,
            description: 'Number of saved tracks to return (1-50, default 20)',
          },
        },
        required: [],
      },
    } as FunctionDeclaration,
    {
      name: 'search_spotify_catalog',
      description: 'Search the Spotify catalog for artists or tracks. Use when the user asks about a specific artist or song, or when recommending artists you want to verify exist on Spotify.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string' as const,
            description: 'Search query (artist name, track name, genre, etc.)',
          },
          type: {
            type: 'string' as const,
            enum: ['artist', 'track', 'both'],
            description: 'What to search for',
          },
        },
        required: ['query', 'type'],
      },
    } as FunctionDeclaration,
    {
      name: 'create_spotify_playlist',
      description: 'Create a real playlist directly on Spotify for the user with specified tracks. Call this tool when the user asks to create or save a playlist to their Spotify account.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string' as const,
            description: 'Name of the playlist',
          },
          description: {
            type: 'string' as const,
            description: 'Short description of the playlist vibe',
          },
          tracks: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                title: { type: 'string' as const, description: 'Track title' },
                artist: { type: 'string' as const, description: 'Artist name' },
              },
              required: ['title'],
            },
            description: 'List of tracks to include in the playlist',
          },
        },
        required: ['name', 'tracks'],
      },
    } as FunctionDeclaration,
  ] as FunctionDeclaration[],
};

// ---------------------------------------------------------------------------
// System prompt — the AI's personality and constraints
// ---------------------------------------------------------------------------

function buildSystemPrompt(dna: ReturnType<typeof getStoredMusicDNA>, userId?: string): string {
  let feedbackContext = '';
  if (userId) {
    try {
      const db = getDb();
      const feedbackRows = db.prepare(`
        SELECT feedback_type, context FROM recommendation_feedback
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `).all(userId) as Array<{ feedback_type: string; context: string | null }>;

      if (feedbackRows.length > 0) {
        const likes = feedbackRows.filter(f => f.feedback_type === 'like').map(f => f.context).filter(Boolean);
        const dislikes = feedbackRows.filter(f => f.feedback_type === 'dislike').map(f => f.context).filter(Boolean);
        feedbackContext = `
User Explicit Feedback Memory:
- Liked/Appreciated Selections: ${likes.length > 0 ? likes.join(', ') : 'None recorded yet'}
- Disliked Selections (Avoid): ${dislikes.length > 0 ? dislikes.join(', ') : 'None recorded yet'}
(Strictly respect these past reactions: prioritize aesthetics the user liked and never suggest artists or tracks they disliked).
`;
      }
    } catch {
      // ignore
    }
  }

  const personalityContext = dna
    ? `
The user's listening personality type is: "${dna.listeningPersonality.type}"
${dna.listeningPersonality.description}

Their dominant genres are: ${dna.genreCategories.dominant.join(', ')}
Secondary genres: ${dna.genreCategories.secondary.join(', ')}
Mainstream score: ${dna.mainstreamScore}/100 (${dna.mainstreamScore > 60 ? 'leans mainstream' : dna.mainstreamScore < 40 ? 'leans underground' : 'balanced'})
Artist diversity: ${dna.artistDiversityScore}/100
`
    : 'The user has not yet synced their Spotify data. Encourage them to run a sync first.';

  return `You are Spotify Companion AI, an intelligent and deeply personalized music curator assistant.

Your role:
- Understand the user's unique musical identity using their actual Spotify listening data
- Recommend music they will genuinely enjoy, with clear explanations of WHY
- Discover hidden gems and underrated artists that fit their taste profile
- Create thoughtful playlists with intentional track progressions
- Analyze their listening patterns and explain what they reveal
- Explore artist discographies and musical connections

Your personality:
- Warm, knowledgeable, and genuinely enthusiastic about music
- Specific rather than generic — always reference the user's actual listening data
- Honest about your reasoning — explain WHY you're recommending something
- Never fabricate data — only use real information from the tools provided
- If data is unavailable, say so clearly rather than making things up

User's musical profile:
${personalityContext}
${feedbackContext}

CRITICAL RULES:
- Always use the available tools to fetch real user data before making recommendations
- Never invent track names, artist names, or listening history
- When recommending artists outside the user's history, acknowledge they're new suggestions
- Explain recommendations in terms of musical characteristics (not just "you might like this")
- Keep responses conversational and engaging, not like a database readout
- Format track/artist lists clearly for readability`;
}

// ---------------------------------------------------------------------------
// Tool execution — called when Gemini requests a tool
// ---------------------------------------------------------------------------

interface ToolArgs {
  time_range?: 'short_term' | 'medium_term' | 'long_term';
  limit?: number;
  query?: string;
  type?: 'artist' | 'track' | 'both';
  name?: string;
  description?: string;
  tracks?: Array<{ title: string; artist?: string }>;
}

async function executeTool(
  toolName: string,
  args: ToolArgs,
  userId: string,
  accessToken: string
): Promise<unknown> {
  switch (toolName) {
    case 'get_user_top_artists': {
      const timeRange = args.time_range ?? 'medium_term';
      const limit = Math.min(args.limit ?? 20, 50);
      const artists = getCachedTopArtists(userId, timeRange).slice(0, limit);
      return formatArtistsForAI(artists, timeRange);
    }

    case 'get_user_top_tracks': {
      const timeRange = args.time_range ?? 'medium_term';
      const limit = Math.min(args.limit ?? 20, 50);
      const tracks = getCachedTopTracks(userId, timeRange).slice(0, limit);
      return formatTracksForAI(tracks, timeRange);
    }

    case 'get_music_dna': {
      // Try stored first, regenerate if needed
      let dna = getStoredMusicDNA(userId);
      if (!dna) dna = generateMusicDNA(userId);
      if (!dna) return { error: 'No music data available. Please sync your Spotify data first.' };

      return {
        personality: dna.listeningPersonality,
        topGenres: dna.topGenres.slice(0, 10).map(g => `${g.name} (${g.score})`),
        genreCategories: dna.genreCategories,
        mainstreamScore: dna.mainstreamScore,
        undergroundScore: dna.undergroundScore,
        artistDiversityScore: dna.artistDiversityScore,
        artistLoyaltyScore: dna.artistLoyaltyScore,
        evolvingTasteScore: dna.evolvingTasteScore,
        coreArtists: dna.coreArtists.slice(0, 10).map(a => ({
          name: a.artist_name,
          genres: a.genres.slice(0, 3),
          loyaltyScore: a.loyaltyScore,
        })),
        dataQuality: dna.dataQuality,
      };
    }

    case 'get_saved_tracks': {
      const limit = Math.min(args.limit ?? 20, 50);
      const tracks = getCachedSavedTracks(userId, limit);
      return formatTracksForAI(tracks, 'saved_library');
    }

    case 'search_spotify_catalog': {
      // Forward to Spotify search API
      const { search } = await import('../spotify.service');
      const types: ('track' | 'artist')[] = args.type === 'both'
        ? ['track', 'artist']
        : [args.type ?? 'artist'];

      const results = await search(accessToken, args.query ?? '', types, 10);
      return {
        artists: results.artists?.items.map(a => ({
          name: a.name,
          genres: a.genres.slice(0, 3),
          // popularity/followers were removed from Dev Mode responses (Feb 2026)
          popularity: a.popularity ?? null,
          followers: a.followers?.total ?? null,
        })) ?? [],
        tracks: results.tracks?.items.map(t => ({
          name: t.name,
          artists: t.artists.map(a => a.name),
          album: t.album.name,
          popularity: t.popularity ?? null,
        })) ?? [],
      };
    }

    case 'create_spotify_playlist': {
      const { createPlaylist, addTracksToPlaylist, resolveTracks } = await import('../spotify.service');
      const playlistName = args.name || 'AI Curated Playlist';
      const desc = args.description || 'Curated by Spotify Companion AI';
      const inputTracks = (args.tracks || []) as Array<{ title: string; artist?: string }>;

      const newPl = await createPlaylist(accessToken, playlistName, desc, false);
      const resolved = await resolveTracks(
        accessToken,
        inputTracks.map(t => ({ title: t.title, artist: t.artist || '' }))
      );

      const uris = resolved.filter(r => r.matched && r.uri).map(r => r.uri as string);
      if (uris.length > 0) {
        await addTracksToPlaylist(accessToken, newPl.id, uris);
      }

      return {
        success: true,
        playlistName: newPl.name,
        tracksAdded: uris.length,
        spotifyUrl: newPl.external_urls.spotify,
        message: `Successfully created playlist "${newPl.name}" with ${uris.length} tracks on Spotify!`
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ---------------------------------------------------------------------------
// Format helpers — make data concise for AI context
// ---------------------------------------------------------------------------

function formatArtistsForAI(artists: CachedArtist[], timeRange: string) {
  return {
    timeRange,
    count: artists.length,
    artists: artists.map((a, i) => ({
      rank: i + 1,
      name: a.artist_name,
      genres: a.genres.slice(0, 4),
      popularity: a.popularity,
    })),
  };
}

function formatTracksForAI(tracks: CachedTrack[], timeRange: string) {
  return {
    timeRange,
    count: tracks.length,
    tracks: tracks.map((t, i) => ({
      rank: i + 1,
      name: t.track_name,
      artists: t.artist_names,
      album: t.album_name,
      popularity: t.popularity,
    })),
  };
}

// ---------------------------------------------------------------------------
// Chat — main entry point
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatResponse {
  reply: string;
  toolsUsed: string[];
  tokensUsed?: number;
}

export async function chat(
  userId: string,
  accessToken: string,
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<ChatResponse> {
  const genAI = getGenAI();

  // Get stored DNA for system prompt context
  const dna = getStoredMusicDNA(userId);

  // Model fallback list — prioritized with ultra-fast gemini-3.1-flash-lite and gemini-3.8-flash
  const modelsToTry = [
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-pro-latest'
  ];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [MUSIC_TOOLS],
        systemInstruction: buildSystemPrompt(dna, userId),
      });

      // Sanitize conversation history to strictly satisfy Gemini SDK requirements:
      // Must start with 'user', strictly alternate 'user' -> 'model', and end with 'model'.
      const history = sanitizeChatHistory(conversationHistory);

      const chatSession = model.startChat({ history });
      const toolsUsed: string[] = [];

      // Send the user's message
      let result = await chatSession.sendMessage(userMessage);
      let response = result.response;

      // Agentic loop — keep executing tool calls until Gemini is done
      let iterations = 0;
      const MAX_ITERATIONS = 5; // Safety limit

      while (response.functionCalls() && response.functionCalls()!.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const functionCalls = response.functionCalls()!;
        const toolResults: Part[] = [];

        // Execute all requested tool calls
        for (const call of functionCalls) {
          toolsUsed.push(call.name);
          console.log(`[ai] Executing tool: ${call.name}`, call.args);

          try {
            const result = await executeTool(
              call.name,
              call.args as ToolArgs,
              userId,
              accessToken
            );

            toolResults.push({
              functionResponse: {
                name: call.name,
                response: { result },
              },
            });
          } catch (err) {
            const error = err instanceof Error ? err.message : 'Tool execution failed';
            toolResults.push({
              functionResponse: {
                name: call.name,
                response: { error },
              },
            });
          }
        }

        // Send tool results back to Gemini
        result = await chatSession.sendMessage(toolResults);
        response = result.response;
      }

      const replyText = response.text();

      // Persist conversation to DB
      persistChatMessages(userId, [
        { role: 'user', content: userMessage },
        { role: 'model', content: replyText },
      ]);

      return {
        reply: replyText,
        toolsUsed: [...new Set(toolsUsed)], // deduplicate
      };
    } catch (err: any) {
      console.warn(`[ai] Model ${modelName} failed with: ${err.message || err}. Trying next fallback...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All AI models failed to respond.');
}

// ---------------------------------------------------------------------------
// Chat history persistence & sanitization
// ---------------------------------------------------------------------------

export function sanitizeChatHistory(messages: ChatMessage[]): Content[] {
  const sanitized: Content[] = [];
  let expectedRole: 'user' | 'model' = 'user';

  for (const msg of messages) {
    if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
      continue;
    }

    if (msg.role === expectedRole) {
      sanitized.push({
        role: msg.role,
        parts: [{ text: msg.content.trim() }],
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  // If the last message is a user message, remove it so history ends with 'model'
  // (the user's current message is passed directly to chatSession.sendMessage)
  if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
    sanitized.pop();
  }

  return sanitized;
}

function persistChatMessages(userId: string, messages: ChatMessage[]): void {
  const db = getDb();
  const sessionId = `session_${Date.now()}`;
  const insert = db.prepare(`
    INSERT INTO chat_history (user_id, session_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    messages.forEach(msg => {
      insert.run(userId, sessionId, msg.role, msg.content, Date.now());
    });
  });

  insertMany();
}

export function getChatHistory(userId: string, limit = 50): ChatMessage[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT role, content FROM chat_history
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, limit) as ChatMessage[];

  return rows.reverse(); // chronological order
}
