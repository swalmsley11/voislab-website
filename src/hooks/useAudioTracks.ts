/**
 * useAudioTracks Hook
 * Manages fetching and caching of audio track metadata from DynamoDB
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AudioTrack,
  AudioTrackWithUrls,
  AudioError,
} from '../types/audio-track';
import { dynamoDBService } from '../services/dynamodb-service';
import { s3Service } from '../services/s3-service';
import {
  fetchTracksFromPublicApi,
  isPublicApiAvailable,
} from '../services/public-api-service';

interface UseAudioTracksState {
  tracks: AudioTrackWithUrls[];
  loading: boolean;
  error: AudioError | null;
  refetch: () => Promise<void>;
  getTrackById: (id: string) => AudioTrackWithUrls | undefined;
  getTracksByGenre: (genre: string) => AudioTrackWithUrls[];
}

interface UseAudioTracksOptions {
  enableCache?: boolean;
  cacheTimeout?: number; // in milliseconds
}

// Simple in-memory cache
interface CacheEntry {
  data: AudioTrackWithUrls[];
  timestamp: number;
}

let cache: CacheEntry | null = null;

export const useAudioTracks = (
  options: UseAudioTracksOptions = {}
): UseAudioTracksState => {
  const { enableCache = true, cacheTimeout = 5 * 60 * 1000 } = options; // 5 minutes default

  const [tracks, setTracks] = useState<AudioTrackWithUrls[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<AudioError | null>(null);

  /**
   * Check if cache is valid
   */
  const isCacheValid = useCallback((): boolean => {
    if (!enableCache || !cache) return false;
    return Date.now() - cache.timestamp < cacheTimeout;
  }, [enableCache, cacheTimeout]);

  /**
   * Enhance tracks with secure URLs
   */
  const enhanceTracksWithUrls = useCallback(
    async (rawTracks: AudioTrack[]): Promise<AudioTrackWithUrls[]> => {
      const enhancedTracks: AudioTrackWithUrls[] = [];

      for (const track of rawTracks) {
        try {
          // Extract the S3 key from the fileUrl (assuming it's stored as a key or full URL)
          const s3Key = track.fileUrl.includes('://')
            ? track.fileUrl.split('/').pop() || track.fileUrl
            : track.fileUrl;

          // Get secure URLs with fallbacks
          const urlData = await s3Service.getAudioUrlsWithFallbacks(
            s3Key.replace(/\.[^/.]+$/, '')
          );

          enhancedTracks.push({
            ...track,
            secureUrl: urlData.primary,
            fallbackUrls: urlData.fallbacks,
          });
        } catch (urlError) {
          console.warn(
            `Failed to generate secure URL for track ${track.id}:`,
            urlError
          );
          // Include track with original URL as fallback
          enhancedTracks.push({
            ...track,
            secureUrl: track.fileUrl,
            fallbackUrls: [],
          });
        }
      }

      return enhancedTracks;
    },
    []
  );

  /**
   * Fetch tracks from Public API or DynamoDB
   */
  const fetchTracks = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      if (isCacheValid() && cache) {
        setTracks(cache.data);
        setLoading(false);
        return;
      }

      let enhancedTracks: AudioTrackWithUrls[];

      // Try public API first (no auth required)
      if (isPublicApiAvailable()) {
        try {
          enhancedTracks = await fetchTracksFromPublicApi();
        } catch (apiError) {
          console.warn(
            'Public API failed, checking if direct access is available:',
            apiError
          );
          // Only fall back to direct DynamoDB access if credentials are available
          const hasCredentials = import.meta.env.VITE_AWS_ACCESS_KEY_ID && 
                                import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
          
          if (hasCredentials) {
            try {
              const rawTracks = await dynamoDBService.getAllTracks();
              enhancedTracks = await enhanceTracksWithUrls(rawTracks);
            } catch (directAccessError) {
              console.warn('Direct AWS access also failed:', directAccessError);
              // If both API and direct access fail, return empty array
              // The component will use fallback tracks
              enhancedTracks = [];
            }
          } else {
            console.warn('No AWS credentials available for direct access, using fallback');
            // Return empty array to trigger fallback tracks in component
            enhancedTracks = [];
          }
        }
      } else {
        // Check if credentials are available for direct access
        const hasCredentials = import.meta.env.VITE_AWS_ACCESS_KEY_ID && 
                              import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
        
        if (hasCredentials) {
          const rawTracks = await dynamoDBService.getAllTracks();
          enhancedTracks = await enhanceTracksWithUrls(rawTracks);
        } else {
          console.warn('No public API URL and no AWS credentials, using fallback');
          // Return empty array to trigger fallback tracks in component
          enhancedTracks = [];
        }
      }

      // Update cache
      if (enableCache) {
        cache = {
          data: enhancedTracks,
          timestamp: Date.now(),
        };
      }

      setTracks(enhancedTracks);
    } catch (err) {
      console.error('Error fetching tracks:', err);
      const audioError: AudioError = {
        type: 'network',
        message: err instanceof Error ? err.message : 'Failed to fetch tracks',
      };
      setError(audioError);
    } finally {
      setLoading(false);
    }
  }, [enhanceTracksWithUrls, enableCache, isCacheValid]);

  /**
   * Get track by ID
   */
  const getTrackById = useCallback(
    (id: string): AudioTrackWithUrls | undefined => {
      return tracks.find((track) => track.id === id);
    },
    [tracks]
  );

  /**
   * Get tracks by genre
   */
  const getTracksByGenre = useCallback(
    (genre: string): AudioTrackWithUrls[] => {
      return tracks.filter((track) => track.genre === genre);
    },
    [tracks]
  );

  /**
   * Refetch tracks (bypasses cache)
   */
  const refetch = useCallback(async (): Promise<void> => {
    cache = null; // Clear cache
    await fetchTracks();
  }, [fetchTracks]);

  // Initial fetch
  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  return {
    tracks,
    loading,
    error,
    refetch,
    getTrackById,
    getTracksByGenre,
  };
};
