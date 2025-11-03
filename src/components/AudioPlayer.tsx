import React, { useState, useRef, useEffect } from 'react';
import { AudioTrackWithUrls } from '../types/audio-track';
import './AudioPlayer.css';

interface AudioPlayerProps {
  track: AudioTrackWithUrls;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (error: string) => void;
  onTrackEnd?: () => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  track,
  className = '',
  onPlay,
  onPause,
  onError,
  onTrackEnd,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onTrackEnd?.();
    };

    const handleError = () => {
      const errorMessage = 'Failed to load audio track';
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
      onError?.(errorMessage);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [track.secureUrl, onError, onTrackEnd]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        onPause?.();
      } else {
        setIsLoading(true);
        await audio.play();
        setIsPlaying(true);
        setIsLoading(false);
        onPlay?.();
      }
    } catch (err) {
      const errorMessage = 'Failed to play audio';
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
      onError?.(errorMessage);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
  };

  const formatTime = (time: number): string => {
    if (isNaN(time)) return '0:00';

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`audio-player ${className}`}>
      <audio ref={audioRef} src={track.secureUrl} preload="metadata" />

      <div className="player-info">
        <h3 className="track-title">{track.title}</h3>
        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="player-controls">
        <button
          className={`play-button ${isPlaying ? 'playing' : ''}`}
          onClick={togglePlayPause}
          disabled={isLoading || !!error}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="loading-spinner"></div>
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" className="pause-icon">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="play-icon">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <div className="progress-container">
          <span className="time-display">{formatTime(currentTime)}</span>
          <div className="progress-wrapper">
            <input
              type="range"
              className="progress-bar"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              disabled={!duration || !!error}
              style={{
                background: `linear-gradient(to right, #4ecdc4 0%, #4ecdc4 ${progressPercentage}%, #333 ${progressPercentage}%, #333 100%)`,
              }}
            />
          </div>
          <span className="time-display">{formatTime(duration)}</span>
        </div>

        <div className="volume-container">
          <svg viewBox="0 0 24 24" className="volume-icon">
            <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <input
            type="range"
            className="volume-bar"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            style={{
              background: `linear-gradient(to right, #4ecdc4 0%, #4ecdc4 ${volume * 100}%, #333 ${volume * 100}%, #333 100%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
