import React from 'react';
import { RefreshCw, LogOut } from 'lucide-react';
import type { SpotifyUserProfile, SyncStatus } from '../types';
import { Avatar, BrandMark } from './Sidebar';

interface HeaderProps {
  user: SpotifyUserProfile | null;
  syncStatus: SyncStatus | null;
  onSync: () => void;
  onLogout: () => void;
  isSyncing: boolean;
}

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return 'never';
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const Header: React.FC<HeaderProps> = ({ user, syncStatus, onSync, onLogout, isSyncing }) => (
  <header className="sticky top-0 z-30 px-4 sm:px-6 lg:px-10 pt-4 pb-3 bg-ink/70 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none">
    <div className="flex items-center justify-between gap-3">
      {/* Mobile brand */}
      <div className="flex items-center gap-2.5 lg:hidden">
        <BrandMark className="w-9 h-9" />
        <span className="font-display text-sm font-semibold tracking-tight">Companion</span>
      </div>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-2 rounded-full bg-glass backdrop-blur-xl ring-1 ring-white/10 p-1 pl-4">
        <span className="hidden sm:inline text-xs text-neutral-400">
          {syncStatus?.hasCachedData ? `Library synced ${timeAgo(syncStatus.lastSyncAt)}` : 'Library not synced'}
        </span>
        <span
          className={`sm:hidden w-2 h-2 rounded-full ${syncStatus?.hasCachedData ? 'bg-phosphor' : 'bg-amber-400'}`}
          aria-hidden="true"
        />
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] px-3.5 py-1.5 text-xs font-semibold text-bone transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing' : 'Sync'}</span>
        </button>
        {user && (
          <div className="flex items-center gap-1 lg:hidden">
            <Avatar user={user} size="w-8 h-8" />
            <button
              onClick={onLogout}
              aria-label="Disconnect Spotify"
              className="grid place-items-center w-8 h-8 rounded-full text-neutral-400 hover:text-rose-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  </header>
);
