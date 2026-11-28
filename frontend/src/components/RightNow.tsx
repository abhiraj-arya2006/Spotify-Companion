import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { DAYPARTS, SESSION_TRACK_COUNT, daypartAt, type Daypart, type SessionRequest } from '../lib/dayparts';

/** "Right now" panel: suggests a soundtrack for the user's local time of day. */
export const RightNow: React.FC = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const current = daypartAt(now);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = DAYPARTS.find(d => d.id === selectedId) ?? current;

  // Keep the clock and the suggested slot current if the tab stays open
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const start = (d: Daypart) => {
    const session: SessionRequest = { daypartId: d.id, prompt: d.prompt, discovery: d.discovery };
    navigate('/playlists', { state: { session } });
  };

  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <section aria-labelledby="right-now-heading" className="rounded-[28px] bg-glass p-6 ring-1 ring-white/[0.07] backdrop-blur-xl sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-neutral-400">
            <time className="tabular-nums text-neutral-300">{time}</time>
            {selected.id === current.id ? ', so we suggest' : ', but you picked'}
          </p>
          <h2 id="right-now-heading" className="mt-1 font-display text-[clamp(1.75rem,4.5vw,2.75rem)] font-black leading-none tracking-[-0.04em] text-bone">
            {selected.title}
          </h2>
          <p className="mt-3 max-w-md text-sm text-neutral-300">{selected.description}</p>
        </div>
        <button
          type="button"
          onClick={() => start(selected)}
          className="inline-flex shrink-0 items-center justify-center gap-2.5 self-start rounded-full bg-phosphor px-6 py-3.5 text-sm font-bold text-ink shadow-[0_0_50px_-12px_rgb(61_245_160/0.9)] transition-transform hover:scale-[1.03] active:scale-[0.98] sm:self-auto"
        >
          <Play className="h-4 w-4 fill-current" />
          Start session
        </button>
      </div>

      <div className="mt-7 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Moment of the day">
        {DAYPARTS.map(d => {
          const isSelected = d.id === selected.id;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedId(d.id === current.id ? null : d.id)}
              className={`shrink-0 rounded-2xl px-4 py-2.5 text-left transition-colors ${
                isSelected ? 'bg-bone text-ink' : 'bg-white/[0.05] text-neutral-300 hover:bg-white/10'
              }`}
            >
              <span className="block text-sm font-semibold">{d.title}</span>
              <span className={`block text-xs ${isSelected ? 'text-ink/60' : 'text-neutral-500'}`}>
                {d.hours}
                {d.id === current.id && ', now'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        Builds a {SESSION_TRACK_COUNT}-track playlist from your taste. You can listen and edit before saving it to Spotify.
      </p>
    </section>
  );
};
