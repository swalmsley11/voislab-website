/**
 * Streaming Platforms Service
 * Manages streaming platform configurations and link generation
 */

import { StreamingPlatform } from '../types/audio-track';

export interface PlatformConfig {
  name: string;
  baseUrl: string;
  searchUrl?: string;
  color: string;
  icon: string;
  isActive: boolean;
}

export interface StreamingPlatformManager {
  platforms: Record<StreamingPlatform['platform'], PlatformConfig>;
  getActivePlatforms: () => PlatformConfig[];
  generateSearchUrl: (
    platform: StreamingPlatform['platform'],
    query: string
  ) => string;
  validateUrl: (
    platform: StreamingPlatform['platform'],
    url: string
  ) => boolean;
  formatPlatformLinks: (links: StreamingPlatform[]) => StreamingPlatform[];
}

class StreamingPlatformsService implements StreamingPlatformManager {
  public platforms: Record<StreamingPlatform['platform'], PlatformConfig> = {
    spotify: {
      name: 'Spotify',
      baseUrl: 'https://open.spotify.com',
      searchUrl: 'https://open.spotify.com/search',
      color: '#1DB954',
      icon: '🎵',
      isActive: true,
    },
    'apple-music': {
      name: 'Apple Music',
      baseUrl: 'https://music.apple.com',
      searchUrl: 'https://music.apple.com/search',
      color: '#FA243C',
      icon: '🍎',
      isActive: true,
    },
    soundcloud: {
      name: 'SoundCloud',
      baseUrl: 'https://soundcloud.com',
      searchUrl: 'https://soundcloud.com/search',
      color: '#FF5500',
      icon: '☁️',
      isActive: true,
    },
    youtube: {
      name: 'YouTube',
      baseUrl: 'https://youtube.com',
      searchUrl: 'https://youtube.com/results',
      color: '#FF0000',
      icon: '📺',
      isActive: true,
    },
    bandcamp: {
      name: 'Bandcamp',
      baseUrl: 'https://bandcamp.com',
      searchUrl: 'https://bandcamp.com/search',
      color: '#629AA0',
      icon: '🎪',
      isActive: true,
    },
  };

  /**
   * Get all active platforms
   */
  getActivePlatforms(): PlatformConfig[] {
    return Object.values(this.platforms).filter(
      (platform) => platform.isActive
    );
  }

  /**
   * Generate search URL for a platform
   */
  generateSearchUrl(
    platform: StreamingPlatform['platform'],
    query: string
  ): string {
    const config = this.platforms[platform];
    if (!config || !config.searchUrl) {
      return '';
    }

    const encodedQuery = encodeURIComponent(query);

    switch (platform) {
      case 'spotify':
        return `${config.searchUrl}/${encodedQuery}`;
      case 'apple-music':
        return `${config.searchUrl}?term=${encodedQuery}`;
      case 'soundcloud':
        return `${config.searchUrl}?q=${encodedQuery}`;
      case 'youtube':
        return `${config.searchUrl}?search_query=${encodedQuery}`;
      case 'bandcamp':
        return `${config.searchUrl}?q=${encodedQuery}`;
      default:
        return `${config.searchUrl}?q=${encodedQuery}`;
    }
  }

  /**
   * Validate platform URL format
   */
  validateUrl(platform: StreamingPlatform['platform'], url: string): boolean {
    const config = this.platforms[platform];
    if (!config) return false;

    try {
      const urlObj = new URL(url);

      switch (platform) {
        case 'spotify':
          return (
            urlObj.hostname === 'open.spotify.com' ||
            urlObj.hostname === 'spotify.com'
          );
        case 'apple-music':
          return urlObj.hostname === 'music.apple.com';
        case 'soundcloud':
          return urlObj.hostname === 'soundcloud.com';
        case 'youtube':
          return (
            urlObj.hostname === 'youtube.com' ||
            urlObj.hostname === 'www.youtube.com' ||
            urlObj.hostname === 'youtu.be'
          );
        case 'bandcamp':
          return urlObj.hostname.includes('bandcamp.com');
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Format and validate platform links
   */
  formatPlatformLinks(links: StreamingPlatform[]): StreamingPlatform[] {
    return links
      .filter((link) => {
        // Validate URL format
        if (!this.validateUrl(link.platform, link.url)) {
          console.warn(`Invalid URL for ${link.platform}: ${link.url}`);
          return false;
        }

        // Check if platform is active
        const config = this.platforms[link.platform];
        if (!config || !config.isActive) {
          console.warn(`Platform ${link.platform} is not active`);
          return false;
        }

        return true;
      })
      .map((link) => ({
        ...link,
        displayName: link.displayName || this.platforms[link.platform]?.name,
      }));
  }

  /**
   * Get platform configuration
   */
  getPlatformConfig(
    platform: StreamingPlatform['platform']
  ): PlatformConfig | null {
    return this.platforms[platform] || null;
  }

  /**
   * Update platform configuration
   */
  updatePlatformConfig(
    platform: StreamingPlatform['platform'],
    updates: Partial<PlatformConfig>
  ): void {
    if (this.platforms[platform]) {
      this.platforms[platform] = {
        ...this.platforms[platform],
        ...updates,
      };
    }
  }

  /**
   * Enable/disable a platform
   */
  setPlatformActive(
    platform: StreamingPlatform['platform'],
    isActive: boolean
  ): void {
    if (this.platforms[platform]) {
      this.platforms[platform].isActive = isActive;
    }
  }

  /**
   * Get suggested platforms for a track (based on genre, popularity, etc.)
   */
  getSuggestedPlatforms(genre?: string): StreamingPlatform['platform'][] {
    // const allPlatforms = Object.keys(this.platforms) as StreamingPlatform['platform'][];

    // Basic genre-based suggestions
    const genrePreferences: Record<string, StreamingPlatform['platform'][]> = {
      electronic: ['spotify', 'soundcloud', 'bandcamp'],
      ambient: ['bandcamp', 'spotify', 'apple-music'],
      experimental: ['bandcamp', 'soundcloud', 'youtube'],
      pop: ['spotify', 'apple-music', 'youtube'],
      rock: ['spotify', 'apple-music', 'youtube'],
      indie: ['bandcamp', 'spotify', 'soundcloud'],
    };

    if (genre && genrePreferences[genre.toLowerCase()]) {
      return genrePreferences[genre.toLowerCase()];
    }

    // Default suggestion order
    return ['spotify', 'apple-music', 'soundcloud', 'youtube', 'bandcamp'];
  }
}

// Export singleton instance
export const streamingPlatformsService = new StreamingPlatformsService();

// Export utility functions
export const formatStreamingLinks = (
  links: StreamingPlatform[]
): StreamingPlatform[] => {
  return streamingPlatformsService.formatPlatformLinks(links);
};

export const generatePlatformSearchUrl = (
  platform: StreamingPlatform['platform'],
  trackTitle: string,
  artistName?: string
): string => {
  const query = artistName ? `${trackTitle} ${artistName}` : trackTitle;
  return streamingPlatformsService.generateSearchUrl(platform, query);
};
