/**
 * routes/data.routes.ts
 *
 * Data sync and Music DNA endpoints — all protected by requireAuth.
 *
 * POST /data/sync          → Trigger full Spotify data sync
 * GET  /data/sync/status   → Check sync status and freshness
 * GET  /data/music-dna     → Get/generate Music DNA profile
 * POST /data/music-dna/refresh → Force regenerate Music DNA
 */

import { Router } from 'express';
import { requireAuth, getAuthLocals } from '../middleware/auth.middleware';
import { syncUserData, getLastSyncTime, hasCachedData } from '../services/sync.service';
import { generateMusicDNA, getStoredMusicDNA } from '../services/music-dna.service';

export const dataRouter = Router();
dataRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /data/sync — trigger full data sync
// ---------------------------------------------------------------------------

dataRouter.post('/sync', async (_req, res, next) => {
  try {
    const { spotifyUserId, accessToken } = getAuthLocals(res);

    console.log(`[data] Sync triggered for user: ${spotifyUserId}`);
    const result = await syncUserData(spotifyUserId, accessToken);

    res.json({
      success: result.success,
      itemsSynced: result.itemsSynced,
      errors: result.errors,
      durationMs: result.durationMs,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /data/sync/status
// ---------------------------------------------------------------------------

dataRouter.get('/sync/status', (_req, res) => {
  const { spotifyUserId } = getAuthLocals(res);
  const lastSync = getLastSyncTime(spotifyUserId);
  const hasData  = hasCachedData(spotifyUserId);

  const AGE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  const isStale = lastSync ? (Date.now() - lastSync) > AGE_THRESHOLD_MS : true;

  res.json({
    hasCachedData: hasData,
    lastSyncAt: lastSync,
    isStale,
    needsSync: !hasData || isStale,
    message: !hasData
      ? 'No data synced yet. Run POST /data/sync to get started.'
      : isStale
        ? 'Data is more than 24 hours old. Consider refreshing.'
        : 'Data is fresh.',
  });
});

// ---------------------------------------------------------------------------
// GET /data/music-dna — get the music DNA profile
// ---------------------------------------------------------------------------

dataRouter.get('/music-dna', (_req, res, next) => {
  try {
    const { spotifyUserId } = getAuthLocals(res);

    // Try stored first
    let dna = getStoredMusicDNA(spotifyUserId);

    // Generate fresh if not stored (uses cached Spotify data)
    if (!dna) {
      if (!hasCachedData(spotifyUserId)) {
        res.status(404).json({
          error: 'NO_DATA',
          message: 'No Spotify data synced yet. Please run POST /data/sync first.',
        });
        return;
      }
      dna = generateMusicDNA(spotifyUserId);
    }

    res.json(dna);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /data/music-dna/refresh — force regenerate
// ---------------------------------------------------------------------------

dataRouter.post('/music-dna/refresh', (_req, res, next) => {
  try {
    const { spotifyUserId } = getAuthLocals(res);

    if (!hasCachedData(spotifyUserId)) {
      res.status(404).json({
        error: 'NO_DATA',
        message: 'No Spotify data synced yet. Please run POST /data/sync first.',
      });
      return;
    }

    const dna = generateMusicDNA(spotifyUserId);
    res.json(dna);
  } catch (err) {
    next(err);
  }
});
