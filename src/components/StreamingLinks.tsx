/**
 * StreamingLinks Component
 * Displays links to streaming platforms where tracks are available
 */

import React from 'react';
import { StreamingPlatform } from '../types/audio-track';
import './StreamingLinks.css';

interface StreamingLinksProps {
  streamingLinks?: StreamingPlatform[];
  className?: string;
  showLabels?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const StreamingLinks: React.FC<StreamingLinksProps> = ({
  streamingLinks = [],
  className = '',
  showLabels = true,
  size = 'medium',
}) => {
  if (!streamingLinks.length) {
    return null;
  }

  const getPlatformIcon = (platform: StreamingPlatform['platform']): string => {
    // In a real implementation, these would be actual icon components or SVGs
    const icons = {
      'spotify': '🎵',
      'apple-music': '🍎',
      'soundcloud': '☁️',
      'youtube': '📺',
      'bandcamp': '🎪',
    };
    return icons[platform] || '🎵';
  };

  const getPlatformName = (platform: StreamingPlatform['platform']): string => {
    const names = {
      'spotify': 'Spotify',
      'apple-music': 'Apple Music',
      'soundcloud': 'SoundCloud',
      'youtube': 'YouTube',
      'bandcamp': 'Bandcamp',
    };
    return names[platform] || platform;
  };

  const getPlatformColor = (platform: StreamingPlatform['platform']): string => {
    const colors = {
      'spotify': '#1DB954',
      'apple-music': '#FA243C',
      'soundcloud': '#FF5500',
      'youtube': '#FF0000',
      'bandcamp': '#629AA0',
    };
    return colors[platform] || '#666';
  };

  return (
    <div className={`streaming-links streaming-links--${size} ${className}`}>
      {showLabels && (
        <span className="streaming-links__label">Listen on:</span>
      )}
      <div className="streaming-links__list">
        {streamingLinks.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="streaming-links__link"
            style={{ '--platform-color': getPlatformColor(link.platform) } as React.CSSProperties}
            title={link.displayName || getPlatformName(link.platform)}
          >
            <span className="streaming-links__icon">
              {getPlatformIcon(link.platform)}
            </span>
            {showLabels && (
              <span className="streaming-links__name">
                {link.displayName || getPlatformName(link.platform)}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
};

export default StreamingLinks;