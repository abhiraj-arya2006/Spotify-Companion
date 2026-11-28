/**
 * PlayerContext — one player for the whole dashboard, in two modes:
 *
 *  - "sdk":   Spotify Web Playback SDK. Full tracks, played by this browser tab.
 *             Spotify only allows it for Premium accounts, on desktop browsers.
 *  - "embed": Spotify's official embed player, driven through its iFrame API.
 *             Works for everyone; plays 30-second previews unless the browser is
 *             signed in to Spotify. (Spotify no longer returns preview_url for
 *             apps created after Nov 2024, so the embed is the preview source.)
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export interface PlayableTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  image?: string | null;
}

type Mode = 'sdk' | 'embed';

interface PlayerContextValue {
  mode: Mode;
  current: PlayableTrack | null;
  queue: PlayableTrack[];
  index: number;
  isPlaying: boolean;
  positionMs: number;
  positionAt: number; // Date.now() when positionMs was reported
  durationMs: number;
  needsReconnect: boolean;
  error: string | null;
  play: (queue: PlayableTrack[], index: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  close: () => void;
  setEmbedHost: (el: HTMLDivElement | null) => void;
}

interface PlayerTokenInfo {
  accessToken: string;
  expiresAt: number | null;
  isPremium: boolean;
  canStream: boolean;
  needsReconnect: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Spotify ships no types for these globals */
declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
    onSpotifyIframeApiReady?: (api: any) => void;
  }
}

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const IFRAME_API_URL = 'https://open.spotify.com/embed/iframe-api/v1';

function loadScript(src: string): void {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  document.body.appendChild(s);
}

let sdkReady: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  sdkReady ??= new Promise(resolve => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    loadScript(SDK_URL);
  });
  return sdkReady;
}

let iframeApi: Promise<any> | null = null;
function loadIframeApi(): Promise<any> {
  iframeApi ??= new Promise(resolve => {
    window.onSpotifyIframeApiReady = api => resolve(api);
    loadScript(IFRAME_API_URL);
  });
  return iframeApi;
}

// The SDK does not support mobile browsers
function isMobileBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<Mode>('embed');
  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [positionAt, setPositionAt] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embedHost, setEmbedHost] = useState<HTMLDivElement | null>(null);

  const tokenRef = useRef<PlayerTokenInfo | null>(null);
  const playerRef = useRef<any>(null);
  const deviceIdRef = useRef<string | null>(null);
  const controllerRef = useRef<any>(null);

  const reportPosition = (pos: number, dur: number) => {
    setPositionMs(pos);
    setDurationMs(dur);
    setPositionAt(Date.now());
  };

  const fetchToken = useCallback(async (): Promise<PlayerTokenInfo> => {
    const cached = tokenRef.current;
    if (cached?.expiresAt && cached.expiresAt - 60_000 > Date.now()) return cached;
    const { data } = await api.get<PlayerTokenInfo>('/spotify/player/token');
    tokenRef.current = data;
    return data;
  }, []);

  // --- Web Playback SDK setup (Premium + desktop only) ----------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let info: PlayerTokenInfo;
      try {
        info = await fetchToken();
      } catch {
        return; // not signed in or offline; the embed still works
      }
      setNeedsReconnect(info.needsReconnect);
      if (!info.canStream || isMobileBrowser()) return;

      await loadSdk();
      if (cancelled) return;

      const player = new window.Spotify.Player({
        name: 'Companion (web)',
        volume: 0.8,
        getOAuthToken: (cb: (t: string) => void) => {
          fetchToken().then(t => cb(t.accessToken)).catch(() => {});
        },
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        deviceIdRef.current = device_id;
        setMode('sdk');
      });
      player.addListener('not_ready', () => {
        deviceIdRef.current = null;
      });
      const fallBack = ({ message }: { message: string }) => {
        console.warn('[player] Web Playback SDK unavailable, using previews:', message);
        deviceIdRef.current = null;
        setMode('embed');
      };
      player.addListener('initialization_error', fallBack);
      player.addListener('authentication_error', fallBack);
      player.addListener('account_error', fallBack);
      player.addListener('playback_error', ({ message }: { message: string }) => setError(`Playback failed: ${message}`));

      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        const t = state.track_window?.current_track;
        if (t) {
          setCurrent({
            id: t.id,
            uri: t.uri,
            name: t.name,
            artists: (t.artists ?? []).map((a: { name: string }) => a.name),
            image: t.album?.images?.[0]?.url ?? null,
          });
        }
        setIsPlaying(!state.paused);
        reportPosition(state.position, state.duration);
      });

      player.connect();
      playerRef.current = player;
    })();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
    };
  }, [fetchToken]);

  // --- Embed player: load / switch the track in Spotify's embed -------------
  useEffect(() => {
    if (mode !== 'embed' || !current || !embedHost) return;
    let cancelled = false;

    loadIframeApi().then(IFrameAPI => {
      if (cancelled) return;
      if (controllerRef.current) {
        controllerRef.current.loadUri(current.uri);
        controllerRef.current.play();
        return;
      }
      // The iFrame API replaces the element it is given, so hand it a child
      // node React does not own.
      const target = document.createElement('div');
      embedHost.replaceChildren(target);
      IFrameAPI.createController(target, { uri: current.uri, width: '100%', height: 80 }, (controller: any) => {
        controllerRef.current = controller;
        controller.addListener('ready', () => controller.play());
        controller.addListener('playback_update', (e: any) => {
          setIsPlaying(!e.data.isPaused);
          reportPosition(e.data.position, e.data.duration);
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [mode, current?.uri, embedHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // Embed host went away (bar closed): tear the embed down
  useEffect(() => {
    if (embedHost) return;
    controllerRef.current?.destroy();
    controllerRef.current = null;
  }, [embedHost]);

  // --- Controls -------------------------------------------------------------
  const playViaSdk = useCallback(
    async (list: PlayableTrack[], i: number) => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return false;
      playerRef.current?.activateElement?.(); // unlocks audio on Safari; must run during the click
      const start = Math.max(0, i - 20);
      const { accessToken } = await fetchToken();
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uris: list.slice(start, start + 100).map(t => t.uri),
          offset: { position: i - start },
        }),
      });
      return res.ok;
    },
    [fetchToken],
  );

  const play = useCallback(
    (list: PlayableTrack[], i: number) => {
      if (!list[i]) return;
      setError(null);
      setQueue(list);
      setIndex(i);
      setCurrent(list[i]);
      if (mode !== 'sdk') return; // embed effect picks up the new track

      playViaSdk(list, i)
        .then(ok => {
          if (!ok) throw new Error('play request rejected');
        })
        .catch(() => {
          setError('Full playback is unavailable right now, so you are hearing a preview.');
          setMode('embed');
        });
    },
    [mode, playViaSdk],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (mode === 'sdk') {
        if (dir === 1) playerRef.current?.nextTrack();
        else playerRef.current?.previousTrack();
        return;
      }
      const i = index + dir;
      if (!queue[i]) return;
      setIndex(i);
      setCurrent(queue[i]);
    },
    [mode, index, queue],
  );

  const toggle = useCallback(() => {
    if (mode === 'sdk') playerRef.current?.togglePlay();
    else controllerRef.current?.togglePlay();
  }, [mode]);

  const seek = useCallback(
    (ms: number) => {
      if (mode === 'sdk') playerRef.current?.seek(Math.round(ms));
      else controllerRef.current?.seek(ms / 1000);
    },
    [mode],
  );

  const close = useCallback(() => {
    if (mode === 'sdk') playerRef.current?.pause();
    controllerRef.current?.destroy();
    controllerRef.current = null;
    setCurrent(null);
    setQueue([]);
    setIsPlaying(false);
    setError(null);
  }, [mode]);

  const value: PlayerContextValue = {
    mode,
    current,
    queue,
    index,
    isPlaying,
    positionMs,
    positionAt,
    durationMs,
    needsReconnect,
    error,
    play,
    toggle,
    next: () => step(1),
    previous: () => step(-1),
    seek,
    close,
    setEmbedHost,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
