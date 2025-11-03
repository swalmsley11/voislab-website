/**
 * Audio Track Type Definitions
 * Defines the structure for audio track data throughout the application
 */

export interface StreamingPlatform {
  platform: 'spotify' | 'apple-music' | 'soundcloud' | 'youtube' | 'bandcamp';
  url: string;
  displayName?: string;
}

export interface AudioTrack {
  id: string;
  title: string;
  description?: string;
  duration: number; // Duration in seconds
  fileUrl: string;
  thumbnailUrl?: string;
  createdDate: Date;
  genre?: string;
  tags?: string[];
  streamingLinks?: StreamingPlatform[];
}

export interface AudioTrackWithUrls extends AudioTrack {
  secureUrl: string;
  fallbackUrls?: string[];
}

// Error types for audio operations
export interface AudioError {
  type:
    | 'network'
    | 'not-found'
    | 'format-unsupported'
    | 'permission-denied'
    | 'unknown';
  message: string;
  trackId?: string;
}

// Loading states for audio operations
export type AudioLoadingState = 'idle' | 'loading' | 'loaded' | 'error';

// Audio player state
export interface AudioPlayerState {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isLoading: boolean;
  error: AudioError | null;
}
