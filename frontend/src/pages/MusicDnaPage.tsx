import React, { useEffect, useState } from 'react';
import { Dna, RefreshCw } from 'lucide-react';
import { getMusicDNA, getMusicDnaHistory, refreshMusicDNA, triggerSync } from '../api/client';
import type { GenreDrift, MusicDNA, ShiftArtist, TasteSnapshot } from '../types';

export const MusicDnaPage: React.FC = () => {
  const [dna, setDna] = useState<MusicDNA | null>(null);
  const [history, setHistory] = useState<TasteSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDNA();
  }, []);

  const loadHistory = () =>
    getMusicDnaHistory().then(setHistory).catch(() => setHistory([]));

  const loadDNA = async () => {
    try {
      setLoading(true);
      setDna(await getMusicDNA());
      await loadHistory();
    } catch (e) {
      console.error('Failed to load Music DNA:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await triggerSync();
      setDna(await refreshMusicDNA());
      await loadHistory();
    } catch (e) {
      console.error('Failed to refresh DNA:', e);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !dna) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-phosphor">
          <span className="eq scale-150" aria-hidden="true"><span /><span /><span /><span /></span>
          <div className="text-sm text-neutral-400">Reading your listening history…</div>
        </div>
      </div>
    );
  }

  if (!dna) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <Dna className="mx-auto mb-5 h-10 w-10 text-phosphor" />
        <h1 className="font-display text-2xl font-bold text-bone">No Music DNA yet</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Sync your Spotify library and Companion will build your taste profile from what you actually play.
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-7 rounded-full bg-phosphor px-6 py-3 text-sm font-bold text-ink transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {refreshing ? 'Syncing your library…' : 'Sync and build my DNA'}
        </button>
      </div>
    );
  }

  const p = dna.listeningPersonality;
  const taste = dna.taste;

  return (
    <div className="animate-fadeIn space-y-20 pb-8 pt-6">
      {/* ---------------------------------------------------------------- */}
      {/* Archetype — the page opens with who you are as a listener        */}
      {/* ---------------------------------------------------------------- */}
      <header>
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-neutral-400">You listen like</p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Updating…' : 'Update'}
          </button>
        </div>
        <h1 className="mt-2 font-display text-[clamp(2.5rem,8vw,5.5rem)] font-black leading-[0.92] tracking-[-0.045em] text-bone">
          {p.type.replace(/^The /, 'the ')}
        </h1>
        <p className="mt-6 max-w-[60ch] text-base leading-relaxed text-neutral-300 sm:text-lg">{p.description}</p>
        <ul className="mt-6 flex max-w-3xl flex-wrap gap-x-6 gap-y-2">
          {p.traits.map(t => (
            <li key={t} className="flex items-center gap-2 text-sm text-neutral-400">
              <span className="h-1 w-3 rounded-full bg-phosphor/70" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-neutral-500">
          Built from {dna.dataQuality.topTracksCount} top tracks, {dna.dataQuality.topArtistsCount} artists and{' '}
          {dna.dataQuality.savedTracksCount} saved songs.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Spectrums                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="spectrum-heading">
        <SectionHeading id="spectrum-heading" title="Where your taste sits" />
        <div className="mt-8 max-w-3xl space-y-9">
          <Spectrum left="Underground" right="Mainstream" value={dna.mainstreamScore} />
          <Spectrum left="Focused" right="Eclectic" value={dna.artistDiversityScore} />
          <Spectrum left="Restless" right="Loyal" value={dna.artistLoyaltyScore} />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Genre drift — the page's centrepiece                             */}
      {/* ---------------------------------------------------------------- */}
      {taste && taste.genreDrift.length > 0 && (
        <section aria-labelledby="drift-heading">
          <SectionHeading
            id="drift-heading"
            title="How your genres moved"
            note="Your all-time top genres on the left, the last four weeks on the right. Tap a genre to follow it."
          />
          <div className="mt-8 rounded-[28px] border border-white/[0.06] bg-glass p-4 backdrop-blur-xl sm:p-8">
            <GenreDriftChart drift={taste.genreDrift} />
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Artists in motion                                                */}
      {/* ---------------------------------------------------------------- */}
      {taste && (taste.risingArtists.length > 0 || taste.fadingArtists.length > 0) && (
        <section aria-labelledby="motion-heading">
          <SectionHeading id="motion-heading" title="Artists on the move" />
          <div className="mt-8 grid gap-12 md:grid-cols-2">
            <ArtistColumn
              title="New in your rotation"
              empty="Nobody new this month. Your current favourites are old friends."
              artists={taste.risingArtists}
              caption={a => `#${a.rank} this month`}
              accent="phosphor"
            />
            <ArtistColumn
              title="Drifted away"
              empty="None of your all-time favourites have gone quiet."
              artists={taste.fadingArtists}
              caption={a => `#${a.rank} all time, absent lately`}
              accent="ultraviolet"
            />
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Deepest cut                                                      */}
      {/* ---------------------------------------------------------------- */}
      {taste?.deepestCut && (
        <section aria-labelledby="cut-heading">
          <SectionHeading id="cut-heading" title="Your deepest cut" />
          <a
            href={`https://open.spotify.com/track/${taste.deepestCut.track_id}`}
            target="_blank"
            rel="noreferrer"
            className="group mt-8 flex max-w-2xl items-center gap-5"
          >
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-800 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)] sm:h-24 sm:w-24">
              {taste.deepestCut.album_image && (
                <img src={taste.deepestCut.album_image} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold text-bone group-hover:text-phosphor sm:text-xl">
                {taste.deepestCut.track_name}
              </div>
              <div className="truncate text-sm text-neutral-300">{taste.deepestCut.artist_names.join(', ')}</div>
              <p className="mt-2 text-sm text-neutral-500">
                Popularity {taste.deepestCut.popularity} out of 100. The least-known song you keep coming back to.
              </p>
            </div>
          </a>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Timeline                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="timeline-heading">
        <SectionHeading id="timeline-heading" title="Your taste over time" />
        {history.length < 2 ? (
          <p className="mt-6 max-w-[60ch] text-sm leading-relaxed text-neutral-400">
            Your timeline starts {history.length === 1 ? `on ${formatDate(history[0].date)}` : 'today'}. Each day you
            sync adds a point, so come back after your next sync to see how your taste moves.
          </p>
        ) : (
          <Timeline history={history} />
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Core artists                                                     */}
      {/* ---------------------------------------------------------------- */}
      {dna.coreArtists.length > 0 && (
        <section aria-labelledby="core-heading">
          <SectionHeading
            id="core-heading"
            title="Always in rotation"
            note="Artists who show up in your last month, last six months and all-time listening."
          />
          <ul className="mt-8 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
            {dna.coreArtists.slice(0, 12).map(a => (
              <li key={a.artist_id} className="text-center">
                <Avatar name={a.artist_name} src={a.image_url} className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
                <div className="mt-3 truncate text-sm font-semibold text-bone">{a.artist_name}</div>
                <div className="text-xs text-neutral-500">
                  {a.loyaltyScore === 3 ? 'Every era' : `${a.loyaltyScore} of 3 eras`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const SectionHeading: React.FC<{ id: string; title: string; note?: string }> = ({ id, title, note }) => (
  <div>
    <h2 id={id} className="font-display text-xl font-bold tracking-[-0.03em] text-bone sm:text-2xl">
      {title}
    </h2>
    {note && <p className="mt-2 max-w-[60ch] text-sm text-neutral-400">{note}</p>}
  </div>
);

function leanWord(value: number, left: string, right: string): string {
  if (value >= 45 && value <= 55) return 'Right in the middle';
  const side = value > 50 ? right : left;
  const strength = Math.abs(value - 50);
  if (strength > 30) return `Strongly ${side.toLowerCase()}`;
  if (strength > 15) return `Leans ${side.toLowerCase()}`;
  return `Slightly ${side.toLowerCase()}`;
}

const Spectrum: React.FC<{ left: string; right: string; value: number }> = ({ left, right, value }) => {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={v < 50 ? 'font-semibold text-bone' : 'text-neutral-500'}>{left}</span>
        <span className="text-xs text-neutral-400">{leanWord(v, left, right)}</span>
        <span className={v > 50 ? 'font-semibold text-bone' : 'text-neutral-500'}>{right}</span>
      </div>
      <div
        className="relative mt-3 h-px bg-white/15"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label={`${left} to ${right}`}
      >
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-white/25" aria-hidden="true" />
        <span
          className="absolute top-1/2 h-px bg-phosphor/70"
          style={{ left: `${Math.min(v, 50)}%`, width: `${Math.abs(v - 50)}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-phosphor shadow-[0_0_20px_rgb(61_245_160/0.6)]"
          style={{ left: `${v}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

// Slope chart: all-time rank (left) → this month's rank (right)
const GenreDriftChart: React.FC<{ drift: GenreDrift[] }> = ({ drift }) => {
  const [active, setActive] = useState<string | null>(null);

  const ranks = Math.max(...drift.flatMap(d => [d.thenRank ?? 0, d.nowRank ?? 0]), 1);
  const W = 360;
  const top = 34;
  const row = 30;
  const H = top + ranks * row + 4;
  const xL = 128;
  const xR = 232;
  const stub = 34; // genres that enter or leave the top list get a short stub, not a full line
  const y = (rank: number) => top + (rank - 0.5) * row;
  const clip = (s: string) => (s.length > 17 ? `${s.slice(0, 16)}…` : s);

  const tone = (d: GenreDrift) => {
    if (d.thenRank === null || (d.nowRank !== null && d.nowRank < d.thenRank)) return 'var(--color-phosphor)';
    if (d.nowRank === null || d.nowRank > d.thenRank) return 'var(--color-ultraviolet)';
    return 'var(--color-bone)';
  };

  const describe = (d: GenreDrift) => {
    if (d.thenRank === null) return `${d.name}: new, now #${d.nowRank}`;
    if (d.nowRank === null) return `${d.name}: was #${d.thenRank}, out of your top genres now`;
    return `${d.name}: #${d.thenRank} all time, #${d.nowRank} this month`;
  };

  return (
    <div className="mx-auto max-w-[560px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Genre ranks, all time versus this month">
        <text x={xL} y={14} textAnchor="end" className="fill-neutral-400" fontSize="11" fontWeight="600">All time</text>
        <text x={xR} y={14} textAnchor="start" className="fill-neutral-400" fontSize="11" fontWeight="600">This month</text>
        <line x1={xL} x2={xL} y1={top - 8} y2={H - 6} stroke="rgb(255 255 255 / 0.12)" />
        <line x1={xR} x2={xR} y1={top - 8} y2={H - 6} stroke="rgb(255 255 255 / 0.12)" />

        {drift.map(d => {
          const color = tone(d);
          const dim = active !== null && active !== d.name;
          const on = active === d.name;
          const partial = d.thenRank === null || d.nowRank === null;
          // Full line between both ranks, or a stub off the one rank it has
          const y1 = d.thenRank !== null ? y(d.thenRank) : y(d.nowRank!);
          const y2 = d.nowRank !== null ? y(d.nowRank) : y(d.thenRank!);
          const x1 = d.thenRank !== null ? xL : xR - stub;
          const x2 = d.nowRank !== null ? xR : xL + stub;
          return (
            <g
              key={d.name}
              onMouseEnter={() => setActive(d.name)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(on ? null : d.name)}
              style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1, transition: 'opacity 200ms' }}
            >
              <title>{describe(d)}</title>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={on ? 3 : 2}
                strokeOpacity={partial ? 0.6 : 0.85}
                strokeDasharray={partial ? '3 4' : undefined}
                strokeLinecap="round"
              />
              {d.thenRank !== null && (
                <>
                  <circle cx={xL} cy={y1} r={4} fill={color} />
                  <text x={xL - 10} y={y1 + 4} textAnchor="end" fontSize="11.5" className="fill-neutral-200 capitalize">
                    {clip(d.name)}
                  </text>
                </>
              )}
              {d.nowRank !== null && (
                <>
                  <circle cx={xR} cy={y2} r={4} fill={color} />
                  <text x={xR + 10} y={y2 + 4} textAnchor="start" fontSize="11.5" className="fill-neutral-200 capitalize">
                    {clip(d.name)}
                  </text>
                </>
              )}
              {/* wide invisible hit area so thin lines are easy to tap */}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
            </g>
          );
        })}
      </svg>
      <p className="mt-4 min-h-[1.25rem] text-center text-xs text-neutral-400" aria-live="polite">
        {active ? describe(drift.find(d => d.name === active)!) : (
          <>
            <span className="text-phosphor">Mint</span> is climbing, <span className="text-ultraviolet">violet</span> is
            fading. Short dashes are genres that joined or left your top {ranks}.
          </>
        )}
      </p>
    </div>
  );
};

const Avatar: React.FC<{ name: string; src: string | null; className?: string }> = ({ name, src, className = '' }) => (
  <div className={`overflow-hidden rounded-full bg-neutral-800 ring-1 ring-white/10 ${className}`}>
    {src ? (
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full w-full items-center justify-center font-display font-bold text-neutral-400">
        {name.charAt(0)}
      </div>
    )}
  </div>
);

const ArtistColumn: React.FC<{
  title: string;
  empty: string;
  artists: ShiftArtist[];
  caption: (a: ShiftArtist) => string;
  accent: 'phosphor' | 'ultraviolet';
}> = ({ title, empty, artists, caption, accent }) => (
  <div>
    <h3 className={`border-l-2 pl-3 text-sm font-semibold text-bone ${accent === 'phosphor' ? 'border-phosphor' : 'border-ultraviolet'}`}>
      {title}
    </h3>
    {artists.length === 0 ? (
      <p className="mt-4 text-sm text-neutral-500">{empty}</p>
    ) : (
      <ul className="mt-5 space-y-4">
        {artists.map(a => (
          <li key={a.artist_id} className="flex items-center gap-4">
            <Avatar name={a.artist_name} src={a.image_url} className={`h-11 w-11 shrink-0 ${accent === 'ultraviolet' ? 'opacity-70 grayscale-[40%]' : ''}`} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-bone">{a.artist_name}</div>
              <div className="text-xs text-neutral-500">{caption(a)}</div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const W = 240;
  const H = 36;
  const step = W / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="mt-2 h-auto w-full" aria-hidden="true">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(255 255 255 / 0.08)" strokeDasharray="2 4" />
      <polyline points={pts} fill="none" stroke="var(--color-phosphor)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * step} cy={H - (last / 100) * H} r={3.5} fill="var(--color-phosphor)" />
    </svg>
  );
};

const Timeline: React.FC<{ history: TasteSnapshot[] }> = ({ history }) => {
  const first = history[0];
  const last = history[history.length - 1];
  const metrics: Array<{ label: string; key: 'mainstream' | 'diversity' | 'loyalty' }> = [
    { label: 'Mainstream', key: 'mainstream' },
    { label: 'Eclectic', key: 'diversity' },
    { label: 'Loyal', key: 'loyalty' },
  ];

  // Days where the archetype changed from the previous snapshot
  const changes = history.filter((s, i) => i === 0 || s.archetype !== history[i - 1].archetype);

  return (
    <div className="mt-8 space-y-10">
      <p className="text-sm text-neutral-400">
        {history.length} snapshots from {formatDate(first.date)} to {formatDate(last.date)}.
      </p>
      <div className="grid gap-8 sm:grid-cols-3">
        {metrics.map(m => {
          const delta = last[m.key] - first[m.key];
          return (
            <div key={m.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-bone">{m.label}</span>
                <span className="text-xs tabular-nums text-neutral-400">
                  {first[m.key]} to {last[m.key]}
                  {delta !== 0 && (
                    <span className={delta > 0 ? 'text-phosphor' : 'text-ultraviolet'}> ({delta > 0 ? '+' : ''}{delta})</span>
                  )}
                </span>
              </div>
              <Sparkline values={history.map(s => s[m.key])} />
            </div>
          );
        })}
      </div>
      <ol className="relative max-w-xl space-y-5 border-l border-white/10 pl-6">
        {changes.map(s => (
          <li key={s.date} className="relative">
            <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-phosphor ring-4 ring-ink" aria-hidden="true" />
            <div className="text-xs text-neutral-500">{formatDate(s.date)}</div>
            <div className="text-sm font-semibold text-bone">{s.archetype}</div>
            <div className="text-xs capitalize text-neutral-400">{s.topGenres.slice(0, 3).join(', ')}</div>
          </li>
        ))}
      </ol>
    </div>
  );
};
