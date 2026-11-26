import React from 'react';
import { NavLink } from 'react-router-dom';
import { Sparkles, Dna, Compass, ListMusic, Home, LogOut, type LucideIcon } from 'lucide-react';
import type { SpotifyUserProfile } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/chat', label: 'Companion', icon: Sparkles },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/dna', label: 'Music DNA', icon: Dna },
  { to: '/explorer', label: 'Explore', icon: Compass },
];

export const BrandMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`relative grid place-items-center rounded-2xl bg-ink text-phosphor ring-1 ring-white/10 ${className}`}
    aria-hidden="true"
  >
    <span className="eq">
      <span /><span /><span /><span />
    </span>
  </div>
);

interface NavRailProps {
  user: SpotifyUserProfile | null;
  onLogout: () => void;
}

/** Desktop: a floating glass rail with icon buttons and hover labels. */
export const NavRail: React.FC<NavRailProps> = ({ user, onLogout }) => (
  <aside className="hidden lg:flex fixed left-5 top-5 bottom-5 z-40 w-[72px] flex-col items-center justify-between rounded-[28px] bg-glass backdrop-blur-2xl ring-1 ring-white/10 py-5">
    <BrandMark className="w-11 h-11" />

    <nav aria-label="Main" className="flex flex-col gap-2">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          aria-label={label}
          className={({ isActive }) =>
            `group relative grid place-items-center w-12 h-12 rounded-2xl transition-colors ${
              isActive
                ? 'bg-phosphor text-ink shadow-[0_0_30px_-4px_rgb(61_245_160/0.7)]'
                : 'text-neutral-400 hover:text-bone hover:bg-white/[0.07]'
            }`
          }
        >
          <Icon className="w-5 h-5" />
          <span className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-xl bg-ink-2 px-3 py-1.5 text-xs font-semibold text-bone ring-1 ring-white/10 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100">
            {label}
          </span>
        </NavLink>
      ))}
    </nav>

    <div className="flex flex-col items-center gap-3">
      {user && <Avatar user={user} size="w-10 h-10" />}
      <button
        onClick={onLogout}
        aria-label="Disconnect Spotify"
        title="Disconnect Spotify"
        className="grid place-items-center w-10 h-10 rounded-xl text-neutral-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  </aside>
);

/** Mobile: an app-style bottom dock. */
export const BottomDock: React.FC = () => (
  <nav
    aria-label="Main"
    className="lg:hidden fixed inset-x-3 z-40 rounded-[26px] bg-ink-2/80 backdrop-blur-2xl ring-1 ring-white/10 px-2 py-2 flex justify-between"
    style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
  >
    {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-semibold transition-colors ${
            isActive ? 'text-ink bg-phosphor' : 'text-neutral-400'
          }`
        }
      >
        <Icon className="w-5 h-5" />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);

export const Avatar: React.FC<{ user: SpotifyUserProfile; size: string }> = ({ user, size }) => (
  <a
    href={user.external_urls?.spotify}
    target="_blank"
    rel="noreferrer"
    title={`${user.display_name || user.id} on Spotify`}
    className={`${size} rounded-full overflow-hidden ring-2 ring-white/15 hover:ring-phosphor transition-all flex-shrink-0 bg-neutral-800 grid place-items-center font-bold text-neutral-300`}
  >
    {user.images?.[0]?.url ? (
      <img src={user.images[0].url} alt="" className="w-full h-full object-cover" />
    ) : (
      (user.display_name || user.id).charAt(0).toUpperCase()
    )}
  </a>
);
