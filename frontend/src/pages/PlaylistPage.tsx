import React, { useMemo, useState } from 'react';
import {
  ListMusic,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Zap,
  ExternalLink,
  Radio,
  X,
  Lock,
  Globe,
  ShieldCheck,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import {
  generatePlaylistBlueprint,
  createSpotifyPlaylist,
  type CreatedPlaylistResult,
  type DiscoveryLevel,
  type PlaylistBlueprint,
} from '../api/client';
import SpotlightCard from '@/components/SpotlightCard';
import ShinyText from '@/components/ShinyText';
import ClickSpark from '@/components/ClickSpark';
import { TrackPlayButton } from '../player/TrackPlayButton';
import type { PlayableTrack } from '../player/PlayerContext';

const TRACK_COUNTS = [10, 20, 30, 50] as const;

const DISCOVERY_OPTIONS: Array<{ value: DiscoveryLevel; label: string; hint: string }> = [
  { value: 'familiar', label: 'Familiar', hint: 'Mostly artists you already love' },
  { value: 'balanced', label: 'Balanced', hint: 'Favourites mixed with discoveries' },
  { value: 'adventurous', label: 'Adventurous', hint: 'Underrated artists & deep cuts' },
];

const PRESETS = [
  { title: 'Midnight Coding Flow', desc: 'Minimalist electronic, downtempo, and atmospheric indie beats.' },
  { title: 'Melancholic Sunday', desc: 'Gentle acoustics, introspective lyricism, and rich instrumentation.' },
  { title: 'Golden Hour Drive', desc: 'Upbeat indie rock, nu-disco, and energetic synth textures.' },
  { title: 'Deep Underground Gems', desc: 'Underrated artists based on your dominant music genres.' },
];

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string; code?: string };
  if (err.code === 'ECONNABORTED') return 'The request timed out. Try a smaller playlist or try again.';
  return err.response?.data?.message || err.message || fallback;
}

export const PlaylistPage: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [trackCount, setTrackCount] = useState<number>(20);
  const [discovery, setDiscovery] = useState<DiscoveryLevel>('balanced');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<PlaylistBlueprint | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistDesc, setPlaylistDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState(false);
  const [createdResult, setCreatedResult] = useState<CreatedPlaylistResult['playlist'] | null>(null);

  const keptTracks = useMemo(
    () => (blueprint ? blueprint.tracks.filter(t => !removed.has(t.uri)) : []),
    [blueprint, removed]
  );

  // Same order as the list on screen, so the player's next/previous follow it
  const playQueue = useMemo<PlayableTrack[]>(
    () =>
      (blueprint?.tracks ?? []).map(t => ({
        id: t.trackId,
        uri: t.uri,
        name: t.name,
        artists: t.artists,
        image: t.albumImage ?? null,
      })),
    [blueprint]
  );

  const handleGenerate = async (customPrompt?: string) => {
    const text = (customPrompt ?? prompt).trim();
    if (!text || generating) return;

    setGenerating(true);
    setGenError(null);
    setBlueprint(null);
    setRemoved(new Set());
    setCreatedResult(null);

    try {
      const bp = await generatePlaylistBlueprint({ prompt: text, trackCount, discoveryLevel: discovery });
      setBlueprint(bp);
      setPlaylistTitle(bp.title);
      setPlaylistDesc(bp.description || `Curated by Spotify Companion AI: ${text}`);
    } catch (e) {
      console.error('Playlist generation failed:', e);
      setGenError(errorMessage(e, 'Failed to generate playlist.'));
    } finally {
      setGenerating(false);
    }
  };

  const toggleRemoved = (uri: string) => {
    setRemoved(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const openExportModal = () => {
    setExportError(null);
    setScopeError(false);
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    if (!playlistTitle.trim() || exporting || keptTracks.length === 0) return;

    try {
      setExporting(true);
      setScopeError(false);
      setExportError(null);
      // Send the exact reviewed URIs — no re-searching, so Spotify gets what you saw.
      const res = await createSpotifyPlaylist({
        name: playlistTitle.trim(),
        description: playlistDesc.trim(),
        tracks: keptTracks.map(t => t.uri),
        isPublic,
      });
      setCreatedResult(res.playlist);
      setShowExportModal(false);
    } catch (e: unknown) {
      console.error('Failed to export playlist:', e);
      const data = (e as { response?: { data?: { needsReauth?: boolean; error?: string } } }).response?.data;
      if (data?.needsReauth || data?.error === 'INSUFFICIENT_SCOPES') {
        setScopeError(true);
      } else {
        setExportError(errorMessage(e, 'Failed to export playlist.'));
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto">
      {/* Header */}
      <div className="pt-6 pb-2">
        <h1 className="font-display font-black text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.04em] text-bone">Playlist Architect</h1>
        <p className="text-base text-neutral-300 mt-4 max-w-xl leading-relaxed">
          Describe a mood. Gemini designs the arc, every track is verified on Spotify, you review it, then export.
        </p>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PRESETS.map(preset => {
          const text = `${preset.title} — ${preset.desc}`;
          return (
            <SpotlightCard
              key={preset.title}
              spotlightColor="rgba(61, 245, 160, 0.28)"
              className="p-0! rounded-2xl! bg-glass/40"
            >
              <button
                onClick={() => {
                  setPrompt(text);
                  handleGenerate(text);
                }}
                disabled={generating}
                className="relative z-[2] h-full w-full p-5 text-left group flex flex-col justify-between cursor-pointer disabled:opacity-50"
              >
                <div>
                  <Sparkles className="w-4 h-4 text-phosphor mb-3" />
                  <div className="font-display text-sm font-semibold text-bone mb-1.5">{preset.title}</div>
                  <div className="text-xs text-neutral-400 line-clamp-2">{preset.desc}</div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-phosphor opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <span>Make this playlist</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            </SpotlightCard>
          );
        })}
      </div>

      {/* Input card */}
      <div className="p-6 rounded-[28px] bg-glass backdrop-blur-xl border border-white/5 space-y-5">
        <div>
          <label htmlFor="pl-prompt" className="block text-xs font-bold text-neutral-300 mb-2">
            Describe your desired vibe or mood
          </label>
          <textarea
            id="pl-prompt"
            rows={3}
            maxLength={1000}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g., A rainy evening playlist with acoustic guitars, nostalgic lyrics, and artists similar to Anuv Jain..."
            className="w-full bg-ink/60 border border-white/5 focus:border-emerald-500/50 rounded-2xl p-4 text-sm text-white placeholder-neutral-500 focus:outline-none transition-all resize-none"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs text-neutral-400 mb-2">Number of songs</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Number of songs">
              {TRACK_COUNTS.map(count => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={trackCount === count}
                  onClick={() => setTrackCount(count)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    trackCount === count ? 'bg-emerald-500 text-black font-bold' : 'bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            {trackCount >= 50 && (
              <div className="text-[11px] text-neutral-500 mt-2">Large playlists take up to a minute to verify on Spotify.</div>
            )}
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-2">Discovery</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Discovery level">
              {DISCOVERY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={discovery === opt.value}
                  title={opt.hint}
                  onClick={() => setDiscovery(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    discovery === opt.value ? 'bg-emerald-500 text-black font-bold' : 'bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-neutral-500 mt-2">
              {DISCOVERY_OPTIONS.find(o => o.value === discovery)?.hint}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <ClickSpark sparkColor={['#3DF5A0', '#8B6CFF', '#EDEAF7']} sparkCount={10} sparkRadius={28} className="w-full! sm:w-auto! h-auto!">
            <button
              onClick={() => handleGenerate()}
              disabled={!prompt.trim() || generating}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-all disabled:opacity-40 disabled:hover:bg-emerald-500 cursor-pointer w-full sm:w-auto"
            >
              <Zap className="w-4 h-4 fill-black text-black" />
              <span>{generating ? 'Curating…' : `Generate ${trackCount}-song playlist`}</span>
            </button>
          </ClickSpark>
        </div>
      </div>

      {/* Generating */}
      {generating && (
        <div className="p-8 rounded-[28px] bg-glass backdrop-blur-xl border border-white/5 text-center space-y-4" aria-live="polite">
          <span className="eq scale-150 text-phosphor inline-flex" aria-hidden="true"><span /><span /><span /><span /></span>
          <div className="font-display text-base font-semibold">
            <ShinyText
              text={`Curating ${trackCount} tracks and checking each one on Spotify…`}
              color="#9C95BA"
              shineColor="#EDEAF7"
              speed={2.4}
            />
          </div>
          <div className="text-xs text-neutral-400 max-w-md mx-auto">
            Gemini designs the energy arc from your Music DNA, then every suggestion is matched against the real Spotify catalog.
          </div>
        </div>
      )}

      {/* Generation error */}
      {genError && !generating && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-sm text-red-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
          <span>{genError}</span>
        </div>
      )}

      {/* Success */}
      {createdResult && (
        <div className="p-6 rounded-[28px] bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-black flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-bold text-white">Playlist exported to Spotify</div>
              <div className="text-xs text-neutral-300">
                "{createdResult.name}" created with {createdResult.tracksAdded} tracks.
              </div>
            </div>
          </div>
          <a
            href={createdResult.spotifyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
          >
            <span>Open in Spotify</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Blueprint review */}
      {blueprint && !generating && (
        <div className="p-5 sm:p-8 rounded-[28px] bg-glass backdrop-blur-xl border border-emerald-500/20 relative overflow-hidden space-y-6">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/5 pb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-400 mb-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {keptTracks.length} tracks verified on Spotify
                  {blueprint.stats.matched < blueprint.stats.requested && ` (asked for ${blueprint.stats.requested})`}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-white break-words">{blueprint.title}</h2>
              <p className="text-xs text-neutral-400 mt-1 max-w-2xl">{blueprint.description}</p>
            </div>

            <button
              onClick={openExportModal}
              disabled={keptTracks.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer flex-shrink-0 disabled:opacity-40"
            >
              <Radio className="w-3.5 h-3.5 text-black" />
              <span>Export to Spotify</span>
            </button>
          </div>

          <ol className="relative space-y-1.5">
            {blueprint.tracks.map((t, idx) => {
              const isRemoved = removed.has(t.uri);
              return (
                <li
                  key={t.uri}
                  className={`flex items-start gap-3 p-2.5 rounded-2xl transition-all ${
                    isRemoved ? 'opacity-40' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="w-6 text-right text-xs text-neutral-500 pt-3 tabular-nums flex-shrink-0">{idx + 1}</span>
                  <TrackPlayButton queue={playQueue} index={idx} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold text-white truncate ${isRemoved ? 'line-through' : ''}`}>{t.name}</div>
                    <div className="text-xs text-neutral-400 truncate">{t.artists.join(', ')}</div>
                    {t.reason && <div className="text-[11px] text-neutral-500 mt-1 leading-snug">{t.reason}</div>}
                  </div>
                  {t.energy && (
                    <span className="hidden sm:inline-block text-[10px] font-semibold text-emerald-300/80 bg-emerald-500/10 px-2 py-0.5 rounded-full mt-2.5 flex-shrink-0 max-w-[9rem] truncate">
                      {t.energy}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleRemoved(t.uri)}
                    aria-label={isRemoved ? `Restore ${t.name}` : `Remove ${t.name}`}
                    className="p-2 mt-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 flex-shrink-0"
                  >
                    {isRemoved ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              );
            })}
          </ol>

          {blueprint.unmatched.length > 0 && (
            <details className="relative rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <summary className="text-xs font-semibold text-neutral-300 cursor-pointer">
                {blueprint.unmatched.length} AI suggestions couldn't be found on Spotify and were left out
              </summary>
              <ul className="mt-3 space-y-1 text-xs text-neutral-500">
                {blueprint.unmatched.map((u, i) => (
                  <li key={i}>{u.title} — {u.artist}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Export confirmation modal */}
      {showExportModal && blueprint && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-title"
        >
          <div className="bg-glass backdrop-blur-xl border border-white/10 rounded-[28px] max-w-xl w-full p-6 sm:p-8 relative space-y-6 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowExportModal(false)}
              aria-label="Close"
              className="absolute top-5 right-5 p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 id="export-title" className="text-xl font-bold text-white">Export to Spotify</h3>
              <p className="text-xs text-neutral-400 mt-1">
                This creates a new playlist in your Spotify library with the {keptTracks.length} tracks you reviewed.
              </p>
            </div>

            {scopeError && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center gap-2.5 text-amber-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Write permission required</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Your Spotify connection doesn't include playlist creation yet. Reconnect to grant it.
                </p>
                <a
                  href="/auth/spotify"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Reconnect Spotify</span>
                </a>
              </div>
            )}

            {exportError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200">{exportError}</div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="pl-name" className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Playlist name
                </label>
                <input
                  id="pl-name"
                  type="text"
                  maxLength={100}
                  value={playlistTitle}
                  onChange={e => setPlaylistTitle(e.target.value)}
                  className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label htmlFor="pl-desc" className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Description
                </label>
                <textarea
                  id="pl-desc"
                  rows={2}
                  maxLength={300}
                  value={playlistDesc}
                  onChange={e => setPlaylistDesc(e.target.value)}
                  className="w-full bg-ink/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 resize-none"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-2.5">
                  {isPublic ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-neutral-400" />}
                  <div>
                    <div className="text-xs font-semibold text-white">{isPublic ? 'Public playlist' : 'Private playlist'}</div>
                    <div className="text-[11px] text-neutral-400">
                      {isPublic ? 'Visible on your public profile' : 'Only visible to you'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublic}
                  aria-label="Public playlist"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${isPublic ? 'bg-emerald-500' : 'bg-neutral-700'}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <ClickSpark sparkColor={['#3DF5A0', '#8B6CFF', '#EDEAF7']} shape="star" sparkCount={12} className="w-auto! h-auto!">
                <button
                  type="button"
                  onClick={handleConfirmExport}
                  disabled={exporting || keptTracks.length === 0 || !playlistTitle.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  {exporting ? 'Creating on Spotify…' : `Create playlist (${keptTracks.length} songs)`}
                </button>
              </ClickSpark>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
