/**
 * types/spotify.ts
 *
 * TypeScript interfaces that mirror Spotify Web API response shapes.
 * Only the fields we actually use are defined here — not exhaustive mirrors.
 */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  email: string;
  country: string;
  product: 'free' | 'premium' | 'open';
  images: SpotifyImage[];
  followers: { total: number };
  external_urls: { spotify: string };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  images: SpotifyImage[];
  followers: { total: number };
  external_urls: { spotify: string };
}

export interface SpotifyTrack {
  id: string;
  name: string;
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  album: {
    id: string;
    name: string;
    release_date: string;
    images: SpotifyImage[];
  };
  artists: Array<{
    id: string;
    name: string;
  }>;
  external_urls: { spotify: string };
}

export interface SpotifyPagingObject<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
  href: string;
}

export interface SpotifyTopTracksResponse extends SpotifyPagingObject<SpotifyTrack> {}
export interface SpotifyTopArtistsResponse extends SpotifyPagingObject<SpotifyArtist> {}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  owner: { id: string; display_name: string | null };
  tracks: { total: number; href: string };
  images: SpotifyImage[];
  external_urls: { spotify: string };
}

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

/** Token data returned by Spotify's /api/token endpoint */
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

/** What we store in the database */
export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp (ms) when the access token expires
  scope: string;
  obtained_at: number; // Unix timestamp (ms) when tokens were originally obtained
}
