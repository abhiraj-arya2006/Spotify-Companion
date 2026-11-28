import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NavRail, BottomDock } from './Sidebar';
import { Header } from './Header';
import { Aura } from './Aura';
import { getTopTracks } from '../api/client';
import { PlayerProvider, usePlayer } from '../player/PlayerContext';
import { MiniPlayer } from '../player/MiniPlayer';
import type { SpotifyUserProfile, SyncStatus } from '../types';

interface LayoutProps {
  user: SpotifyUserProfile | null;
  syncStatus: SyncStatus | null;
  onLogout: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const Layout: React.FC<LayoutProps> = props => (
  <PlayerProvider>
    <LayoutShell {...props} />
  </PlayerProvider>
);

const LayoutShell: React.FC<LayoutProps> = ({ user, syncStatus, onLogout, onSync, isSyncing }) => {
  const [covers, setCovers] = useState<string[]>([]);
  const { current } = usePlayer();

  // The Aura is tinted by what you're listening to right now.
  useEffect(() => {
    getTopTracks('short_term', 8)
      .then(res => {
        const urls = (res.items ?? [])
          .map(t => t.album.images?.[1]?.url || t.album.images?.[0]?.url)
          .filter((u): u is string => !!u);
        setCovers([...new Set(urls)]);
      })
      .catch(() => setCovers([]));
  }, []);

  return (
    <div className="relative min-h-screen text-bone">
      <Aura covers={covers} />

      <NavRail user={user} onLogout={onLogout} />

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-[104px]">
        <Header user={user} syncStatus={syncStatus} onSync={onSync} onLogout={onLogout} isSyncing={isSyncing} />
        {/* Extra bottom room while the player bar is showing, so it never covers content */}
        <main className={`flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 ${current ? 'pb-60 lg:pb-40' : 'pb-32 lg:pb-12'}`}>
          <Outlet />
        </main>
      </div>

      <MiniPlayer />
      <BottomDock />
    </div>
  );
};
