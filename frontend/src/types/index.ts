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

export interface GenreProfile {
  name: string;
  score: number;
  count: number;
}

export interface ArtistProfile {
  artist_id: string;
  artist_name: string;
  image_url: string | null;
  genres: string[];
  popularity: number;
  loyaltyScore: number;
  isCoreFavourite: boolean;
}

export interface TrackProfile {
  track_id: string;
  track_name: string;
  artist_names: string[];
  album_image: string | null;
  popularity: number;
  source: 'top_short' | 'top_medium' | 'top_long' | 'saved';
}

export interface ListeningPersonality {
  type: string;
  description: string;
  traits: string[];
}

export interface MusicDNA {
  userId: string;
  generatedAt: number;
  topGenres: GenreProfile[];
  genreCategories: {
    dominant: string[];
    secondary: string[];
    occasional: string[];
  };
  coreArtists: ArtistProfile[];
  currentFavourites: ArtistProfile[];
  allTimeArtists: ArtistProfile[];
  artistDiversityScore: number;
  currentTopTracks: TrackProfile[];
  savedHighlights: TrackProfile[];
  mainstreamScore: number;
  undergroundScore: number;
  artistLoyaltyScore: number;
  evolvingTasteScore: number;
  savedLibrarySize: number;
  listeningPersonality: ListeningPersonality;
  dataQuality: {
    topArtistsCount: number;
    topTracksCount: number;
    savedTracksCount: number;
    lastSynced: number;
  };
}

export interface SyncStatus {
  hasCachedData: boolean;
  lastSyncAt: number | null;
  isStale: boolean;
  needsSync: boolean;
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  toolsUsed?: string[];
}
