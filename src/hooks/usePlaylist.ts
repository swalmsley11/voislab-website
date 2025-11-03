/**
 * usePlaylist Hook
 * Manages playlist functionality and track navigation
 */

import { useState, useCallback, useMemo } from 'react';
import { AudioTrackWithUrls } from '../types/audio-track';

interface UsePlaylistState {
  playlist: AudioTrackWithUrls[];
  currentIndex: number;
  currentTrack: AudioTrackWithUrls | null;
  hasNext: boolean;
  hasPrevious: boolean;
  isShuffled: boolean;
  isRepeating: boolean;
}

interface UsePlaylistReturn extends UsePlaylistState {
  setPlaylist: (tracks: AudioTrackWithUrls[]) => void;
  playTrack: (track: AudioTrackWithUrls) => void;
  playTrackById: (id: string) => void;
  playNext: () => AudioTrackWithUrls | null;
  playPrevious: () => AudioTrackWithUrls | null;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  clearPlaylist: () => void;
  addToPlaylist: (track: AudioTrackWithUrls) => void;
  removeFromPlaylist: (trackId: string) => void;
}

export const usePlaylist = (): UsePlaylistReturn => {
  const [playlist, setPlaylistState] = useState<AudioTrackWithUrls[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isShuffled, setIsShuffled] = useState<boolean>(false);
  const [isRepeating, setIsRepeating] = useState<boolean>(false);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);

  /**
   * Get current track
   */
  const currentTrack = useMemo((): AudioTrackWithUrls | null => {
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      return playlist[currentIndex];
    }
    return null;
  }, [playlist, currentIndex]);

  /**
   * Check if there's a next track
   */
  const hasNext = useMemo((): boolean => {
    if (isRepeating) return playlist.length > 0;
    return currentIndex < playlist.length - 1;
  }, [currentIndex, playlist.length, isRepeating]);

  /**
   * Check if there's a previous track
   */
  const hasPrevious = useMemo((): boolean => {
    if (isRepeating) return playlist.length > 0;
    return currentIndex > 0;
  }, [currentIndex, playlist.length, isRepeating]);

  /**
   * Generate shuffled indices
   */
  const generateShuffledIndices = useCallback((length: number): number[] => {
    const indices = Array.from({ length }, (_, i) => i);
    
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    return indices;
  }, []);

  /**
   * Set playlist
   */
  const setPlaylist = useCallback((tracks: AudioTrackWithUrls[]) => {
    setPlaylistState(tracks);
    setCurrentIndex(tracks.length > 0 ? 0 : -1);
    
    if (isShuffled) {
      setShuffledIndices(generateShuffledIndices(tracks.length));
    }
  }, [isShuffled, generateShuffledIndices]);

  /**
   * Play specific track
   */
  const playTrack = useCallback((track: AudioTrackWithUrls) => {
    const index = playlist.findIndex(t => t.id === track.id);
    if (index !== -1) {
      setCurrentIndex(index);
    }
  }, [playlist]);

  /**
   * Play track by ID
   */
  const playTrackById = useCallback((id: string) => {
    const track = playlist.find(t => t.id === id);
    if (track) {
      playTrack(track);
    }
  }, [playlist, playTrack]);

  /**
   * Get next index based on shuffle and repeat settings
   */
  const getNextIndex = useCallback((): number => {
    if (playlist.length === 0) return -1;

    if (isShuffled) {
      const currentShuffledIndex = shuffledIndices.indexOf(currentIndex);
      const nextShuffledIndex = currentShuffledIndex + 1;
      
      if (nextShuffledIndex < shuffledIndices.length) {
        return shuffledIndices[nextShuffledIndex];
      } else if (isRepeating) {
        return shuffledIndices[0];
      } else {
        return -1;
      }
    } else {
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < playlist.length) {
        return nextIndex;
      } else if (isRepeating) {
        return 0;
      } else {
        return -1;
      }
    }
  }, [playlist.length, isShuffled, shuffledIndices, currentIndex, isRepeating]);

  /**
   * Get previous index based on shuffle and repeat settings
   */
  const getPreviousIndex = useCallback((): number => {
    if (playlist.length === 0) return -1;

    if (isShuffled) {
      const currentShuffledIndex = shuffledIndices.indexOf(currentIndex);
      const prevShuffledIndex = currentShuffledIndex - 1;
      
      if (prevShuffledIndex >= 0) {
        return shuffledIndices[prevShuffledIndex];
      } else if (isRepeating) {
        return shuffledIndices[shuffledIndices.length - 1];
      } else {
        return -1;
      }
    } else {
      const prevIndex = currentIndex - 1;
      
      if (prevIndex >= 0) {
        return prevIndex;
      } else if (isRepeating) {
        return playlist.length - 1;
      } else {
        return -1;
      }
    }
  }, [playlist.length, isShuffled, shuffledIndices, currentIndex, isRepeating]);

  /**
   * Play next track
   */
  const playNext = useCallback((): AudioTrackWithUrls | null => {
    const nextIndex = getNextIndex();
    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex);
      return playlist[nextIndex];
    }
    return null;
  }, [getNextIndex, playlist]);

  /**
   * Play previous track
   */
  const playPrevious = useCallback((): AudioTrackWithUrls | null => {
    const prevIndex = getPreviousIndex();
    if (prevIndex !== -1) {
      setCurrentIndex(prevIndex);
      return playlist[prevIndex];
    }
    return null;
  }, [getPreviousIndex, playlist]);

  /**
   * Toggle shuffle mode
   */
  const toggleShuffle = useCallback(() => {
    const newShuffled = !isShuffled;
    setIsShuffled(newShuffled);
    
    if (newShuffled) {
      setShuffledIndices(generateShuffledIndices(playlist.length));
    }
  }, [isShuffled, generateShuffledIndices, playlist.length]);

  /**
   * Toggle repeat mode
   */
  const toggleRepeat = useCallback(() => {
    setIsRepeating(!isRepeating);
  }, [isRepeating]);

  /**
   * Clear playlist
   */
  const clearPlaylist = useCallback(() => {
    setPlaylistState([]);
    setCurrentIndex(-1);
    setShuffledIndices([]);
  }, []);

  /**
   * Add track to playlist
   */
  const addToPlaylist = useCallback((track: AudioTrackWithUrls) => {
    setPlaylistState(prev => {
      const exists = prev.some(t => t.id === track.id);
      if (exists) return prev;
      
      const newPlaylist = [...prev, track];
      
      // Update shuffled indices if shuffle is enabled
      if (isShuffled) {
        setShuffledIndices(generateShuffledIndices(newPlaylist.length));
      }
      
      return newPlaylist;
    });
  }, [isShuffled, generateShuffledIndices]);

  /**
   * Remove track from playlist
   */
  const removeFromPlaylist = useCallback((trackId: string) => {
    setPlaylistState(prev => {
      const newPlaylist = prev.filter(t => t.id !== trackId);
      const removedIndex = prev.findIndex(t => t.id === trackId);
      
      // Adjust current index if necessary
      if (removedIndex !== -1 && removedIndex <= currentIndex) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
      
      // Update shuffled indices if shuffle is enabled
      if (isShuffled) {
        setShuffledIndices(generateShuffledIndices(newPlaylist.length));
      }
      
      return newPlaylist;
    });
  }, [currentIndex, isShuffled, generateShuffledIndices]);

  return {
    playlist,
    currentIndex,
    currentTrack,
    hasNext,
    hasPrevious,
    isShuffled,
    isRepeating,
    setPlaylist,
    playTrack,
    playTrackById,
    playNext,
    playPrevious,
    toggleShuffle,
    toggleRepeat,
    clearPlaylist,
    addToPlaylist,
    removeFromPlaylist,
  };
};