/**
 * useAudioTracks Hook - Simplified and Secure
 * 
 * This hook implements the lessons learned from the music upload task:
 * 
 * SECURITY IMPROVEMENTS:
 * - Only uses public API (no AWS SDK calls)
 * - No credentials in frontend code
 * 
 * ARCHITECTURE IMPROVEMENTS:
 * - Simple, single-responsibility approach
 * - Clear error handling without complex fallbacks
 * - Transparent user feedback
 */

import { useState, useEffect, useCallback } from 'react';
import { AudioTrackWithUrls, AudioError } from '../types/audio-track';
import { fetchTracksFromPublicApi, isPublicApiAvailable, getApiUrl } from '../services/public-api-service';

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
  cacheTimeout?: number;
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
  const { enableCache = true, cacheTimeout = 5 * 60 * 1000 } = options;

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
   * Fetch tracks using the simplified, secure approach
   */
  const fetchTracks = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      if (isCacheValid() && cache) {
        console.log('Using cached tracks data');
        setTracks(cache.data);
        setLoading(false);
        return;
      }

      // Check if API is properly configured
      if (!isPublicApiAvailable()) {
        throw new Error('Music service is not properly configured. Please check environment setup.');
      }

      console.log('Fetching tracks from API:', getApiUrl());

      // Fetch from public API (the ONLY data source)
      const fetchedTracks = await fetchTracksFromPublicApi({
        limit: 100,
        status: 'processed'
      });

      // Update cache
      if (enableCache) {
        cache = {
          data: fetchedTracks,
          timestamp: Date.now(),
        };
      }

      setTracks(fetchedTracks);
      console.log('Successfully loaded', fetchedTracks.length, 'tracks');

    } catch (err) {
      console.error('Error loading tracks:', err);
      
      // Create clear, user-friendly error messages
      const audioError: AudioError = {
        type: 'network',
        message: err instanceof Error ? err.message : 'Unable to load music library',
      };
      
      setError(audioError);
      
      // Don't clear existing tracks on error - let component handle fallbacks
      // This allows graceful degradation to sample tracks
    } finally {
      setLoading(false);
    }
  }, [enableCache, isCacheValid]);

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
    console.log('Refetching tracks (bypassing cache)');
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
