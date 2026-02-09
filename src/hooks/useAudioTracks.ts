/**
 * useAudioTracks Hook
 * Simplified version that only uses the public API
 */

import { useState, useEffect, useCallback } from 'react';
import { AudioTrackWithUrls, AudioError } from '../types/audio-track';

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
   * Fetch tracks from Public API only
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

      // Get API URL from environment
      const apiUrl = import.meta.env.VITE_PUBLIC_API_URL;
      
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      console.log('Fetching tracks from:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('API response:', data);

      // Transform the data to match AudioTrackWithUrls interface
      const tracks: AudioTrackWithUrls[] = (data.tracks || []).map((track: any) => ({
        id: track.id,
        title: track.title,
        fileUrl: track.fileUrl || '',
        secureUrl: track.fileUrl || '', // Use the same URL (CloudFront)
        duration: track.duration || 0,
        description: track.description || '',
        createdDate: new Date(track.createdDate),
        genre: track.genre || 'Unknown',
        tags: track.tags || [],
        streamingLinks: track.streamingLinks || [],
      }));

      // Update cache
      if (enableCache) {
        cache = {
          data: tracks,
          timestamp: Date.now(),
        };
      }

      setTracks(tracks);
      console.log('Successfully loaded', tracks.length, 'tracks');

    } catch (err) {
      console.error('Error fetching tracks:', err);
      const audioError: AudioError = {
        type: 'network',
        message: err instanceof Error ? err.message : 'Failed to fetch tracks',
      };
      setError(audioError);
      // Don't set empty tracks on error - let the component handle fallbacks
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
