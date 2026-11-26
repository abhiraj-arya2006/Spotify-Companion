import React, { useState, useEffect } from 'react';
import { 
  Music, 
  User, 
  Bookmark, 
  ExternalLink, 
  Play, 
  Sparkles, 
  Flame,
  Clock
} from 'lucide-react';
import { getTopTracks, getTopArtists, getLibraryTracks } from '../api/client';
import type { SpotifyTrack, SpotifyArtist } from '../types';

export const ExplorerPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tracks' | 'artists' | 'saved'>('tracks');
  const [timeRange, setTimeRange] = useState<'short_term' | 'medium_term' | 'long_term'>('medium_term');
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContent();
  }, [activeTab, timeRange]);

  const loadContent = async () => {
    try {
      setLoading(true);
      if (activeTab === 'tracks') {
        const res = await getTopTracks(timeRange, 50);
        setTracks(res.items || []);
      } else if (activeTab === 'artists') {
        const res = await getTopArtists(timeRange, 50);
        setArtists(res.items || []);
      } else if (activeTab === 'saved') {
        const res = await getLibraryTracks(50);
        // The saved tracks endpoint returns items as { track, added_at }
        const parsed = (res.items || []).map((item: any) => item.track);
        setTracks(parsed);
      }
    } catch (e) {
      console.error('Failed to load explorer items:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:items-end justify-between gap-6 pt-6 pb-2">
        <div>
          <h1 className="font-display font-black text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.04em] text-bone">
            Music Explorer
          </h1>
          <p className="text-base text-neutral-300 mt-4 max-w-xl">
            Browse through your authentic Spotify metrics across different time windows.
          </p>
        </div>

        {/* Time Range Selector (only for top tracks and top artists) */}
        {activeTab !== 'saved' && (
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/5 self-start sm:self-auto">
            <button
              onClick={() => setTimeRange('short_term')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                timeRange === 'short_term'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              4 Weeks
            </button>
            <button
              onClick={() => setTimeRange('medium_term')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                timeRange === 'medium_term'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              6 Months
            </button>
            <button
              onClick={() => setTimeRange('long_term')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                timeRange === 'long_term'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Time
            </button>
          </div>
        )}
      </div>

      {/* Main Tab Switches */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        <button
          onClick={() => setActiveTab('tracks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'tracks'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Top Tracks</span>
        </button>

        <button
          onClick={() => setActiveTab('artists')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'artists'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Top Artists</span>
        </button>

        <button
          onClick={() => setActiveTab('saved')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'saved'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Saved Tracks</span>
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      ) : activeTab === 'artists' ? (
        /* Artist Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {artists.map((artist, idx) => (
            <div
              key={artist.id}
              className="p-4 rounded-2xl bg-glass backdrop-blur-xl hover:bg-raised border border-white/5 transition-all group flex flex-col justify-between"
            >
              <div className="flex items-center gap-3.5 mb-3">
                <div className="relative w-14 h-14 rounded-2xl bg-neutral-800 overflow-hidden flex-shrink-0">
                  {artist.images?.[0]?.url ? (
                    <img src={artist.images[0].url} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-neutral-400">
                      {artist.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-bold text-white">
                    #{idx + 1}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {artist.name}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    {artist.followers?.total?.toLocaleString()} followers
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 mb-3">
                {artist.genres.slice(0, 3).map(g => (
                  <span key={g} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.04] text-neutral-300 capitalize truncate max-w-[120px]">
                    {g}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-neutral-500">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">Popularity:</span>
                  <span className="font-semibold text-neutral-300">{artist.popularity}%</span>
                </div>
                <a
                  href={artist.external_urls.spotify}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-400 hover:text-emerald-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Tracks List View */
        <div className="space-y-2">
          {tracks.map((track, idx) => (
            <div
              key={track.id + idx}
              className="p-3 sm:p-4 rounded-2xl bg-glass backdrop-blur-xl hover:bg-raised border border-white/5 transition-all flex items-center gap-4 group"
            >
              <span className="w-6 text-center text-xs font-bold text-neutral-500 flex-shrink-0">
                {idx + 1}
              </span>

              <div className="w-12 h-12 rounded-xl bg-neutral-800 overflow-hidden flex-shrink-0 relative">
                <img
                  src={track.album?.images?.[0]?.url || ''}
                  alt={track.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {track.name}
                </div>
                <div className="text-xs text-neutral-400 truncate mt-0.5">
                  {track.artists.map(a => a.name).join(', ')} • {track.album?.name}
                </div>
              </div>

              <div className="hidden md:flex items-center gap-3 text-xs text-neutral-400">
                <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/70 rounded-full"
                    style={{ width: `${track.popularity}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[11px]">{track.popularity}%</span>
              </div>

              <a
                href={track.external_urls.spotify}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors flex-shrink-0"
                title="Open in Spotify"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
