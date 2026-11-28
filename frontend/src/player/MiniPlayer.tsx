import React, { useEffect, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { usePlayer } from './PlayerContext';

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const IconButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
  label,
  onClick,
  disabled,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-bone disabled:opacity-30 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

/** Floating player bar. Sits above the mobile dock, and beside the nav rail on desktop. */
export const MiniPlayer: React.FC = () => {
  const p = usePlayer();
  if (!p.current) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))_+_76px)] z-30 lg:bottom-5 lg:left-[116px] lg:right-6">
      <div
        role="region"
        aria-label="Player"
        className="relative mx-auto max-w-3xl overflow-hidden rounded-[22px] bg-ink-2/90 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] ring-1 ring-white/10 backdrop-blur-2xl"
      >
        {p.mode === 'sdk' ? <SdkBar /> : <EmbedBar />}
        {(p.error || p.needsReconnect) && (
          <p className="border-t border-white/5 px-4 py-2 text-xs text-neutral-400">
            {p.error ?? (
              <>
                You're hearing previews.{' '}
                <a href="/auth/spotify" className="font-semibold text-phosphor hover:underline">
                  Reconnect Spotify
                </a>{' '}
                to play full songs here with Premium.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

/** Premium, desktop: our own controls driving the Web Playback SDK. */
const SdkBar: React.FC = () => {
  const p = usePlayer();
  const [, tick] = useState(0);

  // Re-render twice a second while playing so the progress moves
  useEffect(() => {
    if (!p.isPlaying) return;
    const id = window.setInterval(() => tick(n => n + 1), 500);
    return () => window.clearInterval(id);
  }, [p.isPlaying]);

  const t = p.current!;
  const elapsed = Math.min(p.durationMs, p.positionMs + (p.isPlaying ? Date.now() - p.positionAt : 0));
  const pct = p.durationMs ? (elapsed / p.durationMs) * 100 : 0;

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    p.seek(((e.clientX - rect.left) / rect.width) * p.durationMs);
  };

  return (
    <>
      <div
        className="group absolute inset-x-0 top-0 h-2 cursor-pointer"
        onClick={onSeek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(p.durationMs / 1000)}
        aria-valuenow={Math.round(elapsed / 1000)}
        tabIndex={-1}
      >
        <div className="h-[3px] bg-white/10 transition-[height] group-hover:h-[5px]">
          <div className="h-full bg-phosphor" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 pb-3 pt-4">
        {t.image ? (
          <img src={t.image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-lg bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-bone">{t.name}</div>
          <div className="truncate text-xs text-neutral-400">
            {t.artists.join(', ')}
            <span className="hidden tabular-nums text-neutral-500 sm:inline">
              {'  '}
              {formatTime(elapsed)} / {formatTime(p.durationMs)}
            </span>
          </div>
        </div>
        <IconButton label="Previous" onClick={p.previous}>
          <SkipBack className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={p.toggle}
          aria-label={p.isPlaying ? 'Pause' : 'Play'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-phosphor text-ink transition-transform active:scale-95"
        >
          {p.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>
        <IconButton label="Next" onClick={p.next}>
          <SkipForward className="h-4 w-4" />
        </IconButton>
        <IconButton label="Close player" onClick={p.close}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </>
  );
};

/** Everyone else: Spotify's embed (30-second previews) plus queue controls. */
const EmbedBar: React.FC = () => {
  const p = usePlayer();
  return (
    <div className="flex items-center gap-1 p-2">
      {/* Spotify's embed renders inside this box; its own button plays and pauses */}
      <div ref={p.setEmbedHost} className="h-20 min-w-0 flex-1 overflow-hidden rounded-xl bg-white/5" />
      <div className="flex shrink-0 flex-col items-center sm:flex-row">
        <IconButton label="Previous in list" onClick={p.previous} disabled={p.index <= 0}>
          <SkipBack className="h-4 w-4" />
        </IconButton>
        <IconButton label="Next in list" onClick={p.next} disabled={p.index >= p.queue.length - 1}>
          <SkipForward className="h-4 w-4" />
        </IconButton>
      </div>
      <IconButton label="Close player" onClick={p.close}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  );
};
