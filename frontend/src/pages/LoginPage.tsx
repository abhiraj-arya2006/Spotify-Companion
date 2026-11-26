import React from 'react';
import { Aura } from '../components/Aura';
import { BrandMark } from '../components/Sidebar';
import BlurText from '@/components/BlurText';

const CAPABILITIES = [
  { title: 'Music DNA', body: 'A profile of your taste built from what you actually play, not guesses.' },
  { title: 'A curator you can talk to', body: 'Ask for “songs for a 2am drive” and get reasons, not just titles.' },
  { title: 'Playlists, verified', body: 'Up to 50 songs, each checked against Spotify before it reaches your library.' },
];

export const LoginPage: React.FC = () => (
  <div className="relative min-h-screen overflow-hidden text-bone">
    <Aura />

    <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-10 py-8">
      <div className="flex items-center gap-3">
        <BrandMark className="w-10 h-10" />
        <span className="font-display text-sm font-semibold tracking-tight">Companion</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-14 py-16 lg:flex-row lg:items-end lg:justify-between">
        <div className="animate-fadeIn">
          <h1 className="font-display font-black leading-[0.96] tracking-[-0.04em] text-[clamp(3rem,10vw,7.5rem)]">
            <BlurText text="Know why" animateBy="words" delay={120} trigger="load" />
            <BlurText text="you love" animateBy="words" delay={120} trigger="load" />
            <BlurText text="what you love." animateBy="words" delay={160} trigger="load" className="type-outline" />
          </h1>
          <p className="mt-8 max-w-md text-base sm:text-lg leading-relaxed text-neutral-300">
            Your personal music curator. It reads your Spotify listening, learns your taste, and builds playlists that
            explain themselves.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
            <a
              href="/auth/spotify"
              className="inline-flex items-center justify-center gap-3 rounded-full bg-phosphor px-8 py-4 text-base font-bold text-ink shadow-[0_0_60px_-10px_rgb(61_245_160/0.8)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              <span className="eq text-ink" aria-hidden="true">
                <span /><span /><span /><span />
              </span>
              Connect Spotify
            </a>
            <span className="text-xs text-neutral-400 max-w-[16rem]">
              Uses Spotify’s secure sign-in. Your password never touches this app.
            </span>
          </div>
        </div>

        <ul className="max-w-sm space-y-6 lg:pb-3">
          {CAPABILITIES.map(c => (
            <li key={c.title} className="border-l-2 border-phosphor/60 pl-5">
              <div className="font-display text-sm font-semibold">{c.title}</div>
              <p className="mt-1 text-sm text-neutral-400 leading-relaxed">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);
