/**
 * routes/data.routes.ts
 *
 * Data sync and Music DNA endpoints — all protected by requireAuth.
 *
 * POST /data/sync          → Trigger full Spotify data sync
 * GET  /data/sync/status   → Check sync status and freshness
 * GET  /data/music-dna     → Get/generate Music DNA profile
 * GET  /data/music-dna/history → Daily taste snapshots for the timeline
 * POST /data/music-dna/refresh → Force regenerate Music DNA
 */

import { Router } from 'express';
import { requireAuth, getAuthLocals } from '../middleware/auth.middleware';
import { syncUserData, getLastSyncTime, hasCachedData } from '../services/sync.service';
import { generateMusicDNA, getStoredMusicDNA, getMusicDnaHistory } from '../services/music-dna.service';
import { enrichUserData } from '../services/ai/enrichment.service';

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

    // Recompute DNA from the fresh data so today's taste snapshot is recorded
    if (hasCachedData(spotifyUserId)) generateMusicDNA(spotifyUserId);

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

dataRouter.get('/music-dna', async (_req, res, next) => {
  try {
    const { spotifyUserId } = getAuthLocals(res);

    // Try stored first
    let dna = getStoredMusicDNA(spotifyUserId);

    // If stored DNA has missing genres or default fallback scores (due to Spotify API stripping fields), enrich and regenerate
    const isUnenriched = !dna || !dna.taste || dna.topGenres.length === 0 || (dna.mainstreamScore === 30 && dna.artistDiversityScore === 0);

    if (isUnenriched) {
      if (!hasCachedData(spotifyUserId)) {
        res.status(404).json({
          error: 'NO_DATA',
          message: 'No Spotify data synced yet. Please run POST /data/sync first.',
        });
        return;
      }
      try {
        await enrichUserData(spotifyUserId);
      } catch (err: any) {
        console.warn(`[data] Enrichment warning: ${err?.message}`);
      }
      dna = generateMusicDNA(spotifyUserId);
    }

    res.json(dna);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /data/music-dna/history — daily taste snapshots, oldest first
// ---------------------------------------------------------------------------

dataRouter.get('/music-dna/history', (_req, res) => {
  const { spotifyUserId } = getAuthLocals(res);
  const history = getMusicDnaHistory(spotifyUserId);
  res.json({ history, count: history.length });
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
