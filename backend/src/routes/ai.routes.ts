/**
 * routes/ai.routes.ts
 *
 * AI Chat endpoints — protected by requireAuth.
 *
 * POST /ai/chat           → Send a message to the AI companion
 * GET  /ai/chat/history   → Get recent conversation history
 * DELETE /ai/chat/history → Clear conversation history
 */

import { Router } from 'express';
import { requireAuth, getAuthLocals } from '../middleware/auth.middleware';
import { chat, getChatHistory } from '../services/ai/gemini.service';
import { getDb } from '../db/database';
import {
  generatePlaylist,
  PlaylistGenerationError,
  MIN_TRACKS,
  MAX_TRACKS,
  type DiscoveryLevel,
} from '../services/ai/playlist.service';
import { SpotifyApiError } from '../services/spotify.service';

export const aiRouter = Router();
aiRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /ai/chat
// ---------------------------------------------------------------------------

aiRouter.post('/chat', async (req, res, next) => {
  try {
    const { spotifyUserId, accessToken } = getAuthLocals(res);
    const { message, includeHistory = true } = req.body as {
      message?: string;
      includeHistory?: boolean;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Message is required.' });
      return;
    }

    if (message.length > 2000) {
      res.status(400).json({ error: 'MESSAGE_TOO_LONG', message: 'Message must be under 2000 characters.' });
      return;
    }

    // Load recent history for multi-turn context (last 10 exchanges = 20 messages)
    const history = includeHistory ? getChatHistory(spotifyUserId, 20) : [];

    console.log(`[ai] Chat request from user: ${spotifyUserId}, msg: "${message.slice(0, 50)}..."`);

    const response = await chat(spotifyUserId, accessToken, message.trim(), history);

    res.json({
      reply: response.reply,
      toolsUsed: response.toolsUsed,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/playlist/generate
// Body: { prompt: string, trackCount: 5-50, discoveryLevel?: familiar|balanced|adventurous }
// Returns a reviewable blueprint of real Spotify tracks. Writes nothing to Spotify.
// ---------------------------------------------------------------------------

aiRouter.post('/playlist/generate', async (req, res, next) => {
  try {
    const { spotifyUserId, accessToken } = getAuthLocals(res);
    const { prompt, trackCount, discoveryLevel } = req.body as {
      prompt?: unknown;
      trackCount?: unknown;
      discoveryLevel?: unknown;
    };

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Prompt is required (max 1000 characters).' });
      return;
    }
    const count = Number(trackCount);
    if (!Number.isInteger(count) || count < MIN_TRACKS || count > MAX_TRACKS) {
      res.status(400).json({ error: 'INVALID_INPUT', message: `trackCount must be an integer between ${MIN_TRACKS} and ${MAX_TRACKS}.` });
      return;
    }
    const level: DiscoveryLevel = discoveryLevel === 'familiar' || discoveryLevel === 'adventurous'
      ? discoveryLevel
      : 'balanced';

    console.log(`[ai] Playlist generation for ${spotifyUserId}: ${count} tracks, ${level}`);
    const blueprint = await generatePlaylist({
      userId: spotifyUserId,
      accessToken,
      prompt: prompt.trim(),
      trackCount: count,
      discoveryLevel: level,
    });
    res.json(blueprint);
  } catch (err) {
    if (err instanceof PlaylistGenerationError) {
      res.status(502).json({ error: 'PLAYLIST_GENERATION_FAILED', message: err.message });
      return;
    }
    if (err instanceof SpotifyApiError) {
      res.status(err.statusCode === 401 || err.statusCode === 403 ? err.statusCode : 502).json({
        error: 'SPOTIFY_API_ERROR',
        message: err.message,
      });
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /ai/chat/history
// ---------------------------------------------------------------------------

aiRouter.get('/chat/history', (req, res) => {
  const { spotifyUserId } = getAuthLocals(res);
  const limit = parseInt((req.query['limit'] as string) ?? '50', 10);
  const history = getChatHistory(spotifyUserId, Math.min(limit, 100));
  res.json({ history, count: history.length });
});

// ---------------------------------------------------------------------------
// POST /ai/feedback — Record like / dislike / save feedback
// ---------------------------------------------------------------------------

aiRouter.post('/feedback', (req, res, next) => {
  try {
    const { spotifyUserId } = getAuthLocals(res);
    const {
      trackId,
      artistId,
      feedbackType,
      context,
    } = req.body as {
      trackId?: string;
      artistId?: string;
      feedbackType?: 'like' | 'dislike' | 'neutral' | 'save';
      context?: string;
    };

    if (!feedbackType || !['like', 'dislike', 'neutral', 'save'].includes(feedbackType)) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid feedbackType (like, dislike, neutral, save) is required.' });
      return;
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO recommendation_feedback (user_id, spotify_track_id, spotify_artist_id, feedback_type, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      spotifyUserId,
      trackId ?? null,
      artistId ?? null,
      feedbackType,
      context ?? null,
      Date.now()
    );

    res.json({ success: true, feedbackId: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /ai/feedback — Get recent feedback
// ---------------------------------------------------------------------------

aiRouter.get('/feedback', (req, res) => {
  const { spotifyUserId } = getAuthLocals(res);
  const limit = parseInt((req.query['limit'] as string) ?? '50', 10);
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM recommendation_feedback
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(spotifyUserId, Math.min(limit, 100));

  res.json({ feedback: rows, count: rows.length });
});

// ---------------------------------------------------------------------------
// DELETE /ai/chat/history
// ---------------------------------------------------------------------------

aiRouter.delete('/chat/history', (_req, res) => {
  const { spotifyUserId } = getAuthLocals(res);
  const db = getDb();
  const result = db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(spotifyUserId);
  res.json({ success: true, deletedCount: result.changes });
});
