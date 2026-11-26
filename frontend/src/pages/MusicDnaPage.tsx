import React, { useEffect, useState } from 'react';
import { 
  Dna, 
  Sparkles, 
  TrendingUp, 
  Compass, 
  Heart, 
  Flame, 
  Layers, 
  RefreshCw, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { getMusicDNA, refreshMusicDNA, triggerSync } from '../api/client';
import type { MusicDNA } from '../types';
import CountUp from '@/components/CountUp';

export const MusicDnaPage: React.FC = () => {
  const [dna, setDna] = useState<MusicDNA | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDNA();
  }, []);

  const loadDNA = async () => {
    try {
      setLoading(true);
      const data = await getMusicDNA();
      setDna(data);
    } catch (e) {
      console.error('Failed to load Music DNA:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      // Run sync first to ensure freshness, then refresh DNA
      await triggerSync();
      const updated = await refreshMusicDNA();
      setDna(updated);
    } catch (e) {
      console.error('Failed to refresh DNA:', e);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !dna) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <div className="text-sm text-neutral-400">Synthesizing your Music DNA...</div>
        </div>
      </div>
    );
  }

  if (!dna) {
    return (
      <div className="p-8 rounded-[28px] bg-glass backdrop-blur-xl border border-white/5 text-center max-w-lg mx-auto mt-12">
        <Dna className="w-12 h-12 text-emerald-400 mx-auto mb-4 animate-pulse" />
        <h2 className="text-xl font-bold text-white mb-2">No Music DNA Found</h2>
        <p className="text-sm text-neutral-400 mb-6">
          We haven't processed your Spotify listening history yet. Click below to fetch your library and analyze your taste profile.
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-all"
        >
          {refreshing ? 'Processing Library...' : 'Generate Music DNA'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:items-end justify-between gap-6 pt-6 pb-2">
        <div>
          <h1 className="font-display font-black text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.04em] text-bone">
            Your Music DNA
          </h1>
          <p className="text-base text-neutral-300 mt-4 max-w-xl">
            Calculated from {dna.dataQuality.topTracksCount} tracks, {dna.dataQuality.topArtistsCount} artists, and {dna.dataQuality.savedTracksCount} saved library entries.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/10 text-xs font-semibold transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Recalculating...' : 'Refresh DNA'}</span>
        </button>
      </div>

      {/* Personality Archetype Banner */}
      <div className="p-6 sm:p-8 rounded-[28px] bg-gradient-to-br from-phosphor/10 via-glass to-ultraviolet/10 border border-emerald-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-4">
            <Flame className="w-3.5 h-3.5" />
            <span>Listening Personality Archetype</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
            {dna.listeningPersonality.type}
          </h2>

          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed mb-6">
            {dna.listeningPersonality.description}
          </p>

          <div className="flex flex-wrap gap-2">
            {dna.listeningPersonality.traits.map((trait, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-neutral-200"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>{trait}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Four Core Dimension Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Mainstream */}
        <div className="p-5 rounded-2xl bg-glass backdrop-blur-xl border border-white/5">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Mainstream</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-3xl font-black text-bone mb-2 tabular-nums"><CountUp to={dna.mainstreamScore} suffix="%" duration={1.4} /></div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden mb-2">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dna.mainstreamScore}%` }} />
          </div>
          <div className="text-[11px] text-neutral-500">
            {dna.mainstreamScore > 50 ? 'Prefers prominent & charting tracks' : 'Prefers niche & independent music'}
          </div>
        </div>

        {/* Artist Diversity */}
        <div className="p-5 rounded-2xl bg-glass backdrop-blur-xl border border-white/5">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Diversity</span>
            <Compass className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-3xl font-black text-bone mb-2 tabular-nums"><CountUp to={dna.artistDiversityScore} suffix="%" duration={1.4} /></div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden mb-2">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dna.artistDiversityScore}%` }} />
          </div>
          <div className="text-[11px] text-neutral-500">
            {dna.artistDiversityScore > 60 ? 'Wide genre palette across artists' : 'Concentrated in core genres'}
          </div>
        </div>

        {/* Artist Loyalty */}
        <div className="p-5 rounded-2xl bg-glass backdrop-blur-xl border border-white/5">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Loyalty</span>
            <Heart className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-3xl font-black text-bone mb-2 tabular-nums"><CountUp to={dna.artistLoyaltyScore} suffix="%" duration={1.4} /></div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden mb-2">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dna.artistLoyaltyScore}%` }} />
          </div>
          <div className="text-[11px] text-neutral-500">
            {dna.artistLoyaltyScore > 50 ? 'Strong retention of favourite artists' : 'Fast artist turnover & discovery'}
          </div>
        </div>

        {/* Taste Evolution */}
        <div className="p-5 rounded-2xl bg-glass backdrop-blur-xl border border-white/5">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Evolution</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-display text-3xl font-black text-bone mb-2 tabular-nums"><CountUp to={dna.evolvingTasteScore} suffix="%" duration={1.4} /></div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden mb-2">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dna.evolvingTasteScore}%` }} />
          </div>
          <div className="text-[11px] text-neutral-500">
            {dna.evolvingTasteScore > 60 ? 'Current taste is shifting rapidly' : 'Remarkably stable long-term taste'}
          </div>
        </div>
      </div>

      {/* Genre Architecture Hierarchy */}
      <div className="p-6 rounded-[28px] bg-glass backdrop-blur-2xl border border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Genre Hierarchy</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Categorized by listening frequency and artist density.
            </p>
          </div>
        </div>

        {/* Genre Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/5">
            <div className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Dominant Genres</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dna.genreCategories.dominant.map(g => (
                <span key={g} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 capitalize">
                  {g}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/5">
            <div className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span>Secondary Genres</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dna.genreCategories.secondary.map(g => (
                <span key={g} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-neutral-300 border border-white/5 capitalize">
                  {g}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/5">
            <div className="text-xs font-bold text-neutral-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-neutral-500" />
              <span>Occasional Explorations</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dna.genreCategories.occasional.map(g => (
                <span key={g} className="px-2.5 py-1 rounded-lg text-xs font-normal bg-white/[0.02] text-neutral-400 border border-white/5 capitalize">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Top 12 Genre Bars */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-neutral-400 mb-2">
            Weighted Frequency Distribution
          </div>
          {dna.topGenres.slice(0, 10).map((genre) => (
            <div key={genre.name} className="flex items-center gap-3">
              <span className="w-36 sm:w-44 text-xs font-medium text-neutral-300 truncate capitalize text-right">
                {genre.name}
              </span>
              <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-300 rounded-full transition-all duration-500"
                  style={{ width: `${genre.score}%` }}
                />
              </div>
              <span className="w-10 text-xs font-semibold text-neutral-400 text-left">
                {genre.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Core Artists Section */}
      <div className="p-6 rounded-[28px] bg-glass backdrop-blur-2xl border border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-emerald-400" />
              <span>Core Favourite Artists</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Artists who consistently appear across your short, medium, and long-term listening history.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dna.coreArtists.slice(0, 9).map((artist) => (
            <div 
              key={artist.artist_id}
              className="p-4 rounded-2xl bg-white/[0.04] border border-white/5 flex items-center gap-3.5 group hover:border-emerald-500/20 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-neutral-800 overflow-hidden flex-shrink-0">
                {artist.image_url ? (
                  <img src={artist.image_url} alt={artist.artist_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-neutral-400">
                    {artist.artist_name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {artist.artist_name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Loyalty {artist.loyaltyScore}/3
                  </span>
                  <span className="text-xs text-neutral-500 truncate">
                    {artist.genres.slice(0, 2).join(', ')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
