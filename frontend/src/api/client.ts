import axios from 'axios';
import type {
  SpotifyUserProfile,
  SpotifyTrack,
  SpotifyArtist,
  MusicDNA,
  SyncStatus,
  ChatMessage,
} from '../types';

export const api = axios.create({
  baseURL: '', // Using Vite proxy
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Authentication
export const getAuthStatus = async (): Promise<{ authenticated: boolean; userId: string | null }> => {
  const { data } = await api.get('/auth/status');
  return data;
};

export const logout = async (): Promise<{ success: boolean }> => {
  const { data } = await api.post('/auth/logout');
  return data;
};

// Spotify User Profile
export const getProfile = async (): Promise<{ profile: SpotifyUserProfile; meta: { userId: string; memberSince: number | null } }> => {
  const { data } = await api.get('/spotify/profile');
  return data;
};

// Spotify Raw Endpoints
export const getTopTracks = async (timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', limit = 20): Promise<{ items: SpotifyTrack[] }> => {
  const { data } = await api.get(`/spotify/top/tracks?timeRange=${timeRange}&limit=${limit}`);
  return data;
};

export const getTopArtists = async (timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', limit = 20): Promise<{ items: SpotifyArtist[] }> => {
  const { data } = await api.get(`/spotify/top/artists?timeRange=${timeRange}&limit=${limit}`);
  return data;
};

export const getLibraryTracks = async (limit = 20, offset = 0) => {
  const { data } = await api.get(`/spotify/library/tracks?limit=${limit}&offset=${offset}`);
  return data;
};

export const getPlaylists = async (limit = 20, offset = 0) => {
  const { data } = await api.get(`/spotify/playlists?limit=${limit}&offset=${offset}`);
  return data;
};

// Data Sync & Cache
export const getSyncStatus = async (): Promise<SyncStatus> => {
  const { data } = await api.get('/data/sync/status');
  return data;
};

export const triggerSync = async (): Promise<{
  success: boolean;
  itemsSynced: { topTracks: number; topArtists: number; savedTracks: number };
  durationMs: number;
  errors: string[];
}> => {
  const { data } = await api.post('/data/sync');
  return data;
};

// Music DNA
export const getMusicDNA = async (): Promise<MusicDNA> => {
  const { data } = await api.get('/data/music-dna');
  return data;
};

export const refreshMusicDNA = async (): Promise<MusicDNA> => {
  const { data } = await api.post('/data/music-dna/refresh');
  return data;
};

// AI Companion Chat
export const sendChatMessage = async (
  message: string,
  includeHistory = true
): Promise<{ reply: string; toolsUsed: string[] }> => {
  const { data } = await api.post('/ai/chat', { message, includeHistory });
  return data;
};

export const getChatHistory = async (limit = 40): Promise<{ history: ChatMessage[]; count: number }> => {
  const { data } = await api.get(`/ai/chat/history?limit=${limit}`);
  return data;
};

export const clearChatHistory = async (): Promise<{ success: boolean; deletedCount: number }> => {
  const { data } = await api.delete('/ai/chat/history');
  return data;
};

// Phase 8: Playlist Creation & Track Resolution
export interface CreatePlaylistParams {
  name: string;
  description?: string;
  tracks: Array<{ title: string; artist: string }> | string[];
  isPublic?: boolean;
}

export interface CreatedPlaylistResult {
  success: boolean;
  playlist: {
    id: string;
    name: string;
    description: string;
    spotifyUrl: string;
    tracksAdded: number;
  };
}

export const createSpotifyPlaylist = async (
  params: CreatePlaylistParams
): Promise<CreatedPlaylistResult> => {
  const { data } = await api.post('/spotify/playlists', params);
  return data;
};

export interface ResolvedTrackItem {
  queryTitle: string;
  queryArtist: string;
  matched: boolean;
  trackId?: string;
  uri?: string;
  name?: string;
  artists?: string[];
  albumName?: string;
  albumImage?: string;
}

export const resolveSpotifyTracks = async (
  tracks: Array<{ title: string; artist: string }>
): Promise<{ resolved: ResolvedTrackItem[]; count: number }> => {
  const { data } = await api.post('/spotify/tracks/resolve', { tracks });
  return data;
};

// Playlist Architect — structured generation (nothing is written to Spotify)
export type DiscoveryLevel = 'familiar' | 'balanced' | 'adventurous';

export interface PlaylistBlueprintTrack {
  position: number;
  uri: string;
  trackId: string;
  name: string;
  artists: string[];
  albumName?: string;
  albumImage?: string;
  reason: string;
  energy: string;
}

export interface PlaylistBlueprint {
  title: string;
  description: string;
  tracks: PlaylistBlueprintTrack[];
  unmatched: Array<{ title: string; artist: string }>;
  stats: { requested: number; matched: number; candidatesTried: number; model: string };
}

export const generatePlaylistBlueprint = async (params: {
  prompt: string;
  trackCount: number;
  discoveryLevel: DiscoveryLevel;
}): Promise<PlaylistBlueprint> => {
  // Large playlists involve an AI call plus ~70 Spotify lookups — allow time.
  const { data } = await api.post('/ai/playlist/generate', params, { timeout: 180_000 });
  return data;
};

// Phase 10: Feedback Loop
export interface FeedbackItem {
  trackId?: string;
  artistId?: string;
  feedbackType: 'like' | 'dislike' | 'neutral' | 'save';
  context?: string;
}

export const sendFeedback = async (
  feedback: FeedbackItem
): Promise<{ success: boolean; feedbackId: number }> => {
  const { data } = await api.post('/ai/feedback', feedback);
  return data;
};

export const getFeedback = async (limit = 50): Promise<{ feedback: any[]; count: number }> => {
  const { data } = await api.get(`/ai/feedback?limit=${limit}`);
  return data;
};
