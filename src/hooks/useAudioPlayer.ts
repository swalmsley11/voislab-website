/**
 * useAudioPlayer Hook
 * Manages audio player state and playback functionality
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AudioTrack, AudioPlayerState, AudioError } from '../types/audio-track';

interface UseAudioPlayerOptions {
  autoPlay?: boolean;
  volume?: number;
  onTrackEnd?: () => void;
  onError?: (error: AudioError) => void;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  audioRef: React.RefObject<HTMLAudioElement>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  loadTrack: (track: AudioTrack, secureUrl?: string) => void;
  togglePlayPause: () => Promise<void>;
}

export const useAudioPlayer = (
  options: UseAudioPlayerOptions = {}
): UseAudioPlayerReturn => {
  const {
    autoPlay = false,
    volume: initialVolume = 0.8,
    onTrackEnd,
    onError,
  } = options;

  const audioRef = useRef<HTMLAudioElement>(null);

  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: initialVolume,
    isLoading: false,
    error: null,
  });

  /**
   * Update state helper
   */
  const updateState = useCallback((updates: Partial<AudioPlayerState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Handle audio errors
   */
  const handleError = useCallback(
    (errorType: AudioError['type'], message: string) => {
      const error: AudioError = {
        type: errorType,
        message,
        trackId: state.currentTrack?.id,
      };

      updateState({
        error,
        isLoading: false,
        isPlaying: false,
      });

      onError?.(error);
    },
    [state.currentTrack?.id, onError, updateState]
  );

  /**
   * Load a new track
   */
  const loadTrack = useCallback(
    (track: AudioTrack, secureUrl?: string) => {
      if (!audioRef.current) return;

      updateState({
        currentTrack: track,
        isLoading: true,
        error: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      });

      const audio = audioRef.current;
      const urlToUse = secureUrl || track.fileUrl;

      // Set the audio source
      audio.src = urlToUse;
      audio.volume = state.volume;

      // Load the audio
      audio.load();
    },
    [state.volume, updateState]
  );

  /**
   * Play audio
   */
  const play = useCallback(async (): Promise<void> => {
    if (!audioRef.current || !state.currentTrack) return;

    try {
      updateState({ isLoading: true, error: null });
      await audioRef.current.play();
      updateState({ isPlaying: true, isLoading: false });
    } catch (error) {
      console.error('Error playing audio:', error);
      handleError('unknown', 'Failed to play audio');
    }
  }, [state.currentTrack, updateState, handleError]);

  /**
   * Pause audio
   */
  const pause = useCallback(() => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    updateState({ isPlaying: false });
  }, [updateState]);

  /**
   * Stop audio
   */
  const stop = useCallback(() => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    updateState({
      isPlaying: false,
      currentTime: 0,
    });
  }, [updateState]);

  /**
   * Seek to specific time
   */
  const seek = useCallback(
    (time: number) => {
      if (!audioRef.current) return;

      audioRef.current.currentTime = Math.max(
        0,
        Math.min(time, state.duration)
      );
    },
    [state.duration]
  );

  /**
   * Set volume
   */
  const setVolume = useCallback(
    (newVolume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));

      if (audioRef.current) {
        audioRef.current.volume = clampedVolume;
      }

      updateState({ volume: clampedVolume });
    },
    [updateState]
  );

  /**
   * Toggle play/pause
   */
  const togglePlayPause = useCallback(async (): Promise<void> => {
    if (state.isPlaying) {
      pause();
    } else {
      await play();
    }
  }, [state.isPlaying, play, pause]);

  /**
   * Set up audio event listeners
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => {
      updateState({ isLoading: true, error: null });
    };

    const handleCanPlay = () => {
      updateState({
        isLoading: false,
        duration: audio.duration || 0,
      });

      if (autoPlay && state.currentTrack) {
        play();
      }
    };

    const handleTimeUpdate = () => {
      updateState({ currentTime: audio.currentTime });
    };

    const handleEnded = () => {
      updateState({
        isPlaying: false,
        currentTime: 0,
      });
      onTrackEnd?.();
    };

    const handleAudioError = () => {
      const error = audio.error;
      let errorType: AudioError['type'] = 'unknown';
      let message = 'Unknown audio error';

      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorType = 'unknown';
            message = 'Audio playback was aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorType = 'network';
            message = 'Network error while loading audio';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorType = 'format-unsupported';
            message = 'Audio format not supported';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorType = 'format-unsupported';
            message = 'Audio source not supported';
            break;
        }
      }

      handleError(errorType, message);
    };

    const handleLoadedMetadata = () => {
      updateState({ duration: audio.duration || 0 });
    };

    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleAudioError);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Cleanup
    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleAudioError);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [
    autoPlay,
    state.currentTrack,
    play,
    onTrackEnd,
    handleError,
    updateState,
  ]);

  return {
    ...state,
    audioRef,
    play,
    pause,
    stop,
    seek,
    setVolume,
    loadTrack,
    togglePlayPause,
  };
};
