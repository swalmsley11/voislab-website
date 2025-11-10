import React, { useState, useMemo } from 'react';
import AudioPlayer from './AudioPlayer';
import StreamingLinks from './StreamingLinks';
import CopyrightNotice from './CopyrightNotice';
import { useAudioTracks } from '../hooks/useAudioTracks';
import { useTrackStreamingLinks } from '../hooks/useStreamingLinks';
import { AudioTrackWithUrls } from '../types/audio-track';
import { voisLabAnalytics } from '../utils/analytics';
import './MusicLibrary.css';

interface MusicLibraryProps {
  // Optional fallback tracks for development/testing
  fallbackTracks?: AudioTrackWithUrls[];
  className?: string;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'title' | 'date' | 'duration';

const MusicLibrary: React.FC<MusicLibraryProps> = ({
  fallbackTracks = [],
  className = '',
}) => {
  const { tracks, loading, error, refetch } = useAudioTracks();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [, setCurrentTrack] = useState<string | null>(null);

  // Use AWS data if available, otherwise fall back to provided tracks
  const displayTracks = tracks.length > 0 ? tracks : fallbackTracks;

  // Get unique genres for filter dropdown
  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    displayTracks.forEach((track) => {
      if (track.genre) {
        genreSet.add(track.genre);
      }
    });
    return Array.from(genreSet).sort();
  }, [displayTracks]);

  // Filter and sort tracks
  const filteredAndSortedTracks = useMemo(() => {
    let filtered = displayTracks.filter((track) => {
      const matchesSearch =
        track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        track.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        track.tags?.some((tag) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const matchesGenre = !selectedGenre || track.genre === selectedGenre;

      return matchesSearch && matchesGenre;
    });

    // Sort tracks
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'date':
          return (
            new Date(b.createdDate).getTime() -
            new Date(a.createdDate).getTime()
          );
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [displayTracks, searchTerm, selectedGenre, sortBy]);

  const formatDuration = (duration?: number): string => {
    if (!duration) return 'Unknown';
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const handleTrackPlay = (trackId: string) => {
    setCurrentTrack(trackId);
  };

  const handleTrackPause = () => {
    setCurrentTrack(null);
  };

  // Handle loading state
  if (loading && fallbackTracks.length === 0) {
    return (
      <section className={`music-library ${className}`}>
        <div className="library-container">
          <div className="library-loading">
            <p>Loading music library...</p>
          </div>
        </div>
      </section>
    );
  }

  // Handle error state
  if (error && fallbackTracks.length === 0) {
    return (
      <section className={`music-library ${className}`}>
        <div className="library-container">
          <div className="library-error">
            <p>Error loading music library: {error.message}</p>
            <button onClick={refetch} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`music-library ${className}`}>
      <div className="library-container">
        <div className="library-header">
          <h2 className="library-title">Music Library</h2>
          <p className="library-description">
            Explore our collection of original compositions and audio creations
          </p>

          {/* Connection Status */}
          {error && fallbackTracks.length > 0 && (
            <div className="library-warning">
              <p>Using offline data. {error.message}</p>
              <button onClick={refetch} className="retry-button">
                Try Reconnecting
              </button>
            </div>
          )}
        </div>

        <div className="library-controls">
          <div className="search-filter-row">
            <div className="search-container">
              <svg viewBox="0 0 24 24" className="search-icon">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search tracks, descriptions, or tags..."
                value={searchTerm}
                onChange={(e) => {
                  const newSearchTerm = e.target.value;
                  setSearchTerm(newSearchTerm);

                  // Track search with debouncing
                  if (newSearchTerm.length >= 3) {
                    setTimeout(() => {
                      if (newSearchTerm === searchTerm) {
                        const resultsCount = displayTracks.filter((track) => {
                          return (
                            track.title
                              .toLowerCase()
                              .includes(newSearchTerm.toLowerCase()) ||
                            track.description
                              ?.toLowerCase()
                              .includes(newSearchTerm.toLowerCase()) ||
                            track.tags?.some((tag) =>
                              tag
                                .toLowerCase()
                                .includes(newSearchTerm.toLowerCase())
                            )
                          );
                        }).length;
                        voisLabAnalytics.trackSearch(
                          newSearchTerm,
                          resultsCount
                        );
                      }
                    }, 1000);
                  }
                }}
                className="search-input"
              />
            </div>

            <div className="filter-container">
              <select
                value={selectedGenre}
                onChange={(e) => {
                  const newGenre = e.target.value;
                  setSelectedGenre(newGenre);

                  // Track filter usage
                  if (newGenre) {
                    voisLabAnalytics.trackFilter('genre', newGenre);
                  }
                }}
                className="genre-filter"
              >
                <option value="">All Genres</option>
                {genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="view-sort-row">
            <div className="view-controls">
              <button
                className={`view-button ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <svg viewBox="0 0 24 24" className="view-icon">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                className={`view-button ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <svg viewBox="0 0 24 24" className="view-icon">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>

            <div className="sort-container">
              <label htmlFor="sort-select" className="sort-label">
                Sort by:
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="sort-select"
              >
                <option value="date">Date</option>
                <option value="title">Title</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>
        </div>

        <div className="library-stats">
          <span className="track-count">
            {filteredAndSortedTracks.length} of {displayTracks.length} tracks
          </span>
        </div>

        {filteredAndSortedTracks.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" className="empty-icon">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6" />
              <path d="m21 12-6 0m-6 0-6 0" />
            </svg>
            <h3>No tracks found</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className={`tracks-container ${viewMode}`}>
            {filteredAndSortedTracks.map((track) => (
              <TrackItem
                key={track.id}
                track={track}
                onPlay={() => handleTrackPlay(track.id)}
                onPause={handleTrackPause}
                formatDuration={formatDuration}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// Separate TrackItem component for better organization
interface TrackItemProps {
  track: AudioTrackWithUrls;
  onPlay: () => void;
  onPause: () => void;
  formatDuration: (duration?: number) => string;
  formatDate: (date: Date) => string;
}

const TrackItem: React.FC<TrackItemProps> = ({
  track,
  onPlay,
  onPause,
  formatDuration,
  formatDate,
}) => {
  const { directLinks } = useTrackStreamingLinks(track);

  return (
    <div className="track-item">
      <div className="track-info">
        <h3 className="track-title">{track.title}</h3>
        {track.description && (
          <p className="track-description">{track.description}</p>
        )}
        <div className="track-metadata">
          <span className="track-duration">
            {formatDuration(track.duration)}
          </span>
          <span className="track-date">{formatDate(track.createdDate)}</span>
          {track.genre && <span className="track-genre">{track.genre}</span>}
        </div>
        {track.tags && track.tags.length > 0 && (
          <div className="track-tags">
            {track.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Streaming Platform Links */}
        {directLinks.length > 0 && (
          <div className="track-streaming-links">
            <StreamingLinks
              streamingLinks={directLinks}
              trackId={track.id}
              size="small"
              showLabels={false}
            />
          </div>
        )}

        {/* Copyright Notice */}
        <div className="track-copyright">
          <CopyrightNotice
            trackTitle={track.title}
            year={new Date(track.createdDate).getFullYear()}
            variant="minimal"
          />
        </div>
      </div>
      <div className="track-player">
        <AudioPlayer track={track} onPlay={onPlay} onPause={onPause} />
      </div>
    </div>
  );
};

export default MusicLibrary;
