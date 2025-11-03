/**
 * useStreamingLinks Hook
 * Manages streaming platform links for tracks
 */

import { useState, useCallback, useMemo } from 'react';
import { StreamingPlatform, AudioTrack } from '../types/audio-track';
import { 
  streamingPlatformsService, 
  formatStreamingLinks, 
  generatePlatformSearchUrl 
} from '../services/streaming-platforms';

interface UseStreamingLinksOptions {
  autoGenerateSearchLinks?: boolean;
  artistName?: string;
}

interface UseStreamingLinksReturn {
  formatLinks: (links: StreamingPlatform[]) => StreamingPlatform[];
  generateSearchLinks: (track: AudioTrack) => StreamingPlatform[];
  validateLink: (platform: StreamingPlatform['platform'], url: string) => boolean;
  getActivePlatforms: () => string[];
  getSuggestedPlatforms: (genre?: string) => StreamingPlatform['platform'][];
}

export const useStreamingLinks = (
  options: UseStreamingLinksOptions = {}
): UseStreamingLinksReturn => {
  const { autoGenerateSearchLinks = false, artistName } = options;

  /**
   * Format and validate streaming links
   */
  const formatLinks = useCallback((links: StreamingPlatform[]): StreamingPlatform[] => {
    return formatStreamingLinks(links);
  }, []);

  /**
   * Generate search links for platforms where the track isn't directly available
   */
  const generateSearchLinks = useCallback((track: AudioTrack): StreamingPlatform[] => {
    if (!autoGenerateSearchLinks) return [];

    const existingPlatforms = new Set(
      (track.streamingLinks || []).map(link => link.platform)
    );

    const suggestedPlatforms = streamingPlatformsService.getSuggestedPlatforms(track.genre);
    
    const searchLinks: StreamingPlatform[] = [];

    for (const platform of suggestedPlatforms) {
      if (!existingPlatforms.has(platform)) {
        const searchUrl = generatePlatformSearchUrl(platform, track.title, artistName);
        if (searchUrl) {
          searchLinks.push({
            platform,
            url: searchUrl,
            displayName: `Search on ${streamingPlatformsService.platforms[platform]?.name}`,
          });
        }
      }
    }

    return searchLinks;
  }, [autoGenerateSearchLinks, artistName]);

  /**
   * Validate a streaming platform URL
   */
  const validateLink = useCallback((
    platform: StreamingPlatform['platform'], 
    url: string
  ): boolean => {
    return streamingPlatformsService.validateUrl(platform, url);
  }, []);

  /**
   * Get list of active platform names
   */
  const getActivePlatforms = useCallback((): string[] => {
    return streamingPlatformsService
      .getActivePlatforms()
      .map(config => config.name);
  }, []);

  /**
   * Get suggested platforms for a genre
   */
  const getSuggestedPlatforms = useCallback((genre?: string): StreamingPlatform['platform'][] => {
    return streamingPlatformsService.getSuggestedPlatforms(genre);
  }, []);

  return {
    formatLinks,
    generateSearchLinks,
    validateLink,
    getActivePlatforms,
    getSuggestedPlatforms,
  };
};

/**
 * Hook for managing streaming links for a specific track
 */
export const useTrackStreamingLinks = (
  track: AudioTrack | null,
  options: UseStreamingLinksOptions = {}
) => {
  const { formatLinks, generateSearchLinks } = useStreamingLinks(options);
  
  const [additionalLinks, setAdditionalLinks] = useState<StreamingPlatform[]>([]);

  /**
   * All available links (direct + search links)
   */
  const allLinks = useMemo((): StreamingPlatform[] => {
    if (!track) return [];

    const directLinks = formatLinks(track.streamingLinks || []);
    const searchLinks = generateSearchLinks(track);
    
    return [...directLinks, ...searchLinks, ...additionalLinks];
  }, [track, formatLinks, generateSearchLinks, additionalLinks]);

  /**
   * Only direct streaming links (no search links)
   */
  const directLinks = useMemo((): StreamingPlatform[] => {
    if (!track) return [];
    return formatLinks(track.streamingLinks || []);
  }, [track, formatLinks]);

  /**
   * Add a custom streaming link
   */
  const addLink = useCallback((link: StreamingPlatform) => {
    const formattedLinks = formatLinks([link]);
    if (formattedLinks.length > 0) {
      setAdditionalLinks(prev => [...prev, formattedLinks[0]]);
    }
  }, [formatLinks]);

  /**
   * Remove a streaming link
   */
  const removeLink = useCallback((platform: StreamingPlatform['platform']) => {
    setAdditionalLinks(prev => prev.filter(link => link.platform !== platform));
  }, []);

  /**
   * Clear all additional links
   */
  const clearAdditionalLinks = useCallback(() => {
    setAdditionalLinks([]);
  }, []);

  return {
    allLinks,
    directLinks,
    additionalLinks,
    addLink,
    removeLink,
    clearAdditionalLinks,
  };
};