import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ListMusic, RefreshCw } from 'lucide-react';
import { getProfile, getMusicDNA, getTopTracks, triggerSync } from '../api/client';
import CircularGallery from '@/components/CircularGallery';
import BlurText from '@/components/BlurText';
import CountUp from '@/components/CountUp';
import type { SpotifyUserProfile, MusicDNA, SpotifyTrack, SyncStatus } from '../types';

interface OverviewPageProps {
  syncStatus: SyncStatus | null;
  onRefreshSyncStatus: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Fan geometry for up to 5 covers: back cards rotate further out. */
const FAN = [
  { rot: -18, tx: -46 },
  { rot: 18, tx: 46 },
  { rot: -9, tx: -22 },
  { rot: 9, tx: 22 },
  { rot: 0, tx: 0 },
];

export const OverviewPage: React.FC<OverviewPageProps> = ({ syncStatus, onRefreshSyncStatus }) => {
  const [profile, setProfile] = useState<SpotifyUserProfile | null>(null);
  const [dna, setDna] = useState<MusicDNA | null>(null);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Phones get smaller gallery cards so more than one fits across the screen.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Stable references so the WebGL gallery doesn't rebuild on every render.
  const galleryTracks = useMemo(() => topTracks.filter(t => t.album.images?.[0]?.url), [topTracks]);
  const galleryItems = useMemo(
    () =>
      galleryTracks.map((t, i) => ({
        image: t.album.images[0].url,
        text: `${i + 1}. ${t.name}`,
        description: t.artists.map(a => a.name).join(', '),
        alt: `${t.name} by ${t.artists.map(a => a.name).join(', ')}`,
      })),
    [galleryTracks]
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileRes, dnaRes, tracksRes] = await Promise.allSettled([
        getProfile(),
        getMusicDNA(),
        getTopTracks('short_term', 20),
      ]);
      if (profileRes.status === 'fulfilled') setProfile(profileRes.value.profile);
      if (dnaRes.status === 'fulfilled') setDna(dnaRes.value);
      if (tracksRes.status === 'fulfilled') setTopTracks(tracksRes.value.items || []);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSync = async () => {
    try {
      setSyncing(true);
      await triggerSync();
      await loadData();
      onRefreshSyncStatus();
    } catch (e) {
      console.error('Failed to sync:', e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-phosphor">
        <span className="eq scale-150" aria-hidden="true"><span /><span /><span /><span /></span>
        <span className="sr-only">Loading your music profile</span>
      </div>
    );
  }

  const firstName = (profile?.display_name || '').split(' ')[0];
  const fanCovers = topTracks
    .map(t => t.album.images?.[0]?.url)
    .filter((u): u is string => !!u)
    .filter((u, i, all) => all.indexOf(u) === i)
    .slice(0, 5);
  const needsSync = !syncStatus?.hasCachedData || syncStatus?.needsSync;

  return (
    <div className="space-y-20 lg:space-y-28">
      {/* ---------------- Hero ---------------- */}
      <section className="grid items-center gap-12 pt-6 lg:grid-cols-[1.4fr_1fr] lg:pt-14">
        <div className="animate-fadeIn order-2 lg:order-1 relative z-10 min-w-0">
          <p className="text-base text-neutral-300">
            {greeting()}{firstName ? `, ${firstName}` : ''}. Your listening says you’re
          </p>
          <h1 className="mt-3 font-display font-black leading-[0.95] tracking-[-0.04em] text-[clamp(2.2rem,4.4vw,4rem)] text-balance">
            <BlurText
              key={dna?.listeningPersonality.type ?? 'none'}
              text={dna?.listeningPersonality.type ?? 'Still a mystery'}
              animateBy="words"
              direction="bottom"
              delay={140}
              trigger="load"
            />
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-neutral-300">
            {dna?.listeningPersonality.description ??
              'Sync your Spotify library and Companion will work out what your taste is made of.'}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/playlists"
              className="inline-flex items-center gap-2.5 rounded-full bg-phosphor px-6 py-3.5 text-sm font-bold text-ink shadow-[0_0_50px_-12px_rgb(61_245_160/0.9)] transition-transform hover:scale-[1.03]"
            >
              <ListMusic className="w-4 h-4" />
              Make a playlist
            </Link>
            <Link
              to="/chat"
              className="inline-flex items-center gap-2.5 rounded-full bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-bone ring-1 ring-white/15 backdrop-blur-xl transition-colors hover:bg-white/[0.14]"
            >
              <Sparkles className="w-4 h-4 text-phosphor" />
              Ask Companion
            </Link>
            {needsSync && (
              <button
                onClick={handleRunSync}
                disabled={syncing}
                className="inline-flex items-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-semibold text-amber-200 ring-1 ring-amber-300/30 hover:bg-amber-300/10 disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing your library' : syncStatus?.hasCachedData ? 'Refresh library' : 'Sync your library'}
              </button>
            )}
          </div>
        </div>

        {fanCovers.length > 0 && (
          <div className="order-1 flex justify-center lg:order-2">
            <div className="fan" aria-label="Your current heavy rotation" role="img">
              {fanCovers.map((url, i) => {
                const g = FAN[i + (5 - fanCovers.length)] ?? FAN[4];
                return (
                  <div
                    key={url}
                    className="fan__card"
                    style={{
                      ['--rot' as string]: `${g.rot}deg`,
                      ['--tx' as string]: `${g.tx}px`,
                      ['--delay' as string]: `${0.15 + i * 0.09}s`,
                    }}
                  >
                    <img src={url} alt="" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ---------------- Taste readout ---------------- */}
      {dna && (
        <section className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 className="text-xl font-semibold">Where your taste sits</h2>
            <div className="mt-8">
              <div className="relative h-3 rounded-full bg-gradient-to-r from-ultraviolet via-white/20 to-phosphor">
                <div
                  className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone ring-4 ring-ink shadow-[0_0_25px_rgb(237_234_247/0.6)]"
                  style={{ left: `${dna.mainstreamScore}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3 flex justify-between text-xs text-neutral-400">
                <span>Underground</span>
                <span>Mainstream</span>
              </div>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-6">
              <div>
                <dt className="text-sm text-neutral-400">Mainstream</dt>
                <dd className="font-display text-4xl font-black tabular-nums">
                  <CountUp to={dna.mainstreamScore} duration={1.4} />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-400">Artist diversity</dt>
                <dd className="font-display text-4xl font-black tabular-nums">
                  <CountUp to={dna.artistDiversityScore} duration={1.4} />
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold">What you’re made of</h2>
              <Link to="/dna" className="text-sm font-semibold text-phosphor hover:underline underline-offset-4 whitespace-nowrap">
                Full Music DNA
              </Link>
            </div>
            {/* Genres when Spotify provides them; otherwise the artists you return to most. */}
            {(() => {
              const words = dna.topGenres.length
                ? dna.topGenres.slice(0, 9).map(g => ({ key: g.name, label: g.name, score: g.score }))
                : dna.coreArtists.slice(0, 9).map(a => ({ key: a.artist_id, label: a.artist_name, score: a.loyaltyScore }));
              if (!words.length) {
                return <p className="mt-6 text-sm text-neutral-400">Sync your library to see what your taste is built on.</p>;
              }
              const max = Math.max(...words.map(w => w.score), 1);
              return (
                <>
                  {!dna.topGenres.length && (
                    <p className="mt-2 text-sm text-neutral-400">The artists you keep coming back to.</p>
                  )}
                  <p className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2 font-display font-semibold leading-tight [overflow-wrap:anywhere]">
                    {words.map((w, i) => {
                      // Rank-based when scores are flat (artist fallback), score-based for genres
                      const weight = dna.topGenres.length
                        ? Math.max(0.35, w.score / max)
                        : Math.max(0.3, 1 - i * 0.09);
                      return (
                        <span
                          key={w.key}
                          className={dna.topGenres.length ? 'capitalize' : ''}
                          style={{
                            fontSize: `${0.85 + weight * 1.15}rem`,
                            opacity: 0.45 + weight * 0.55,
                            color: i === 0 ? 'var(--color-phosphor)' : undefined,
                          }}
                        >
                          {w.label}
                        </span>
                      );
                    })}
                  </p>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {/* ---------------- Heavy rotation (ranked) ---------------- */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">On repeat lately</h2>
            <p className="mt-1 text-sm text-neutral-400">Your most-played tracks from the last four weeks.</p>
          </div>
          <Link to="/explorer" className="text-sm font-semibold text-phosphor hover:underline underline-offset-4 whitespace-nowrap">
            Explore all
          </Link>
        </div>

        {topTracks.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-400">
            Nothing here yet. Play some music on Spotify, then sync your library.
          </p>
        ) : (
          <>
            {/* React Bits CircularGallery: drag, scroll or tab through your rotation; click opens Spotify */}
            <div className="-mx-4 mt-6 h-[340px] sm:-mx-6 sm:h-[460px] lg:-mx-10" aria-hidden="true">
              <CircularGallery
                items={galleryItems}
                bend={isPhone ? 1.4 : 2.2}
                itemSize={isPhone ? 0.8 : 1}
                gap={isPhone ? 0.18 : 0.26}
                textColor="#EDEAF7"
                font="600 18px 'Hanken Grotesk'"
                borderRadius={0.06}
                openOnClick={false}
                onItemClick={(_item, i) => window.open(galleryTracks[i]?.external_urls.spotify, '_blank', 'noopener')}
              />
            </div>
            {/* The WebGL gallery is visual only; this list is the accessible version */}
            <ol className="sr-only">
              {galleryTracks.map((track, idx) => (
                <li key={track.id}>
                  <a href={track.external_urls.spotify} target="_blank" rel="noreferrer">
                    {idx + 1}. {track.name} by {track.artists.map(a => a.name).join(', ')}
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
};
