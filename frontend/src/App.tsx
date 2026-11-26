import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getAuthStatus, getProfile, getSyncStatus, triggerSync, logout } from './api/client';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { MusicDnaPage } from './pages/MusicDnaPage';
import { AiCompanionPage } from './pages/AiCompanionPage';
import { ExplorerPage } from './pages/ExplorerPage';
import { PlaylistPage } from './pages/PlaylistPage';
import type { SpotifyUserProfile, SyncStatus } from './types';

export const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<SpotifyUserProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const status = await getAuthStatus();
      setAuthenticated(status.authenticated);
      if (status.authenticated) {
        await Promise.allSettled([
          loadProfile(),
          loadSyncStatus()
        ]);
      }
    } catch (e) {
      console.error('Failed to check auth status:', e);
      setAuthenticated(false);
    }
  };

  const loadProfile = async () => {
    try {
      const res = await getProfile();
      setUser(res.profile);
    } catch (e) {
      console.error('Failed to load user profile:', e);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const res = await getSyncStatus();
      setSyncStatus(res);
    } catch (e) {
      console.error('Failed to load sync status:', e);
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await triggerSync();
      await loadSyncStatus();
    } catch (e) {
      console.error('Failed to run sync:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setAuthenticated(false);
      setUser(null);
      setSyncStatus(null);
    } catch (e) {
      console.error('Failed to log out:', e);
    }
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-phosphor">
          <span className="eq scale-150" aria-hidden="true"><span /><span /><span /><span /></span>
          <div className="text-sm text-neutral-400 font-medium">Tuning in…</div>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <Layout
              user={user}
              syncStatus={syncStatus}
              onLogout={handleLogout}
              onSync={handleSync}
              isSyncing={isSyncing}
            />
          }
        >
          <Route 
            path="/" 
            element={
              <OverviewPage 
                syncStatus={syncStatus} 
                onRefreshSyncStatus={loadSyncStatus} 
              />
            } 
          />
          <Route path="/chat" element={<AiCompanionPage />} />
          <Route path="/dna" element={<MusicDnaPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/playlists" element={<PlaylistPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
