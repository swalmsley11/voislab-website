/**
 * Public API Service - Simplified and Secure
 * 
 * This is the ONLY service that should be used for fetching audio data.
 * It follows the lessons learned from the music upload task:
 * 
 * SECURITY IMPROVEMENTS:
 * - No AWS credentials in frontend code
 * - Only uses public API endpoints
 * - Clear error handling with fallback behavior
 * 
 * ARCHITECTURE IMPROVEMENTS:
 * - Single responsibility: fetch from public API
 * - Simple error handling without complex fallbacks
 * - Clear success/failure states
 */

import { AudioTrackWithUrls } from '../types/audio-track';

const PUBLIC_API_URL = import.meta.env.VITE_PUBLIC_API_URL;

export interface FetchTracksOptions {
  limit?: number;
  status?: string;
}

export interface FetchTracksResponse {
  tracks: AudioTrackWithUrls[];
  count: number;
}

/**
 * Fetch tracks from the public API
 * This is the ONLY method that should be used to load audio data
 */
export async function fetchTracksFromPublicApi(
  options: FetchTracksOptions = {}
): Promise<AudioTrackWithUrls[]> {
  // Check if API URL is configured
  if (!PUBLIC_API_URL) {
    console.error('Public API URL not configured. Check VITE_PUBLIC_API_URL environment variable.');
    throw new Error('API configuration missing. Please check environment setup.');
  }

  const { limit = 100, status = 'processed' } = options;

  // Build URL with parameters
  const url = new URL(PUBLIC_API_URL);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('status', status);

  console.log('Fetching tracks from public API:', url.toString());

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    const data: FetchTracksResponse = await response.json();
    console.log('Successfully loaded', data.tracks?.length || 0, 'tracks from API');

    // Transform and validate the data
    const tracks = (data.tracks || []).map((track) => ({
      id: track.id,
      title: track.title,
      fileUrl: track.fileUrl,
      secureUrl: track.fileUrl, // Use the same URL (CloudFront provides security)
      duration: track.duration,
      description: track.description || '',
      createdDate: new Date(track.createdDate),
      genre: track.genre || 'Unknown',
      tags: track.tags || [],
      streamingLinks: track.streamingLinks || [],
    }));

    return tracks;

  } catch (error) {
    // Provide clear error messages for different failure scenarios
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('Network error - API may be unreachable:', error);
      throw new Error('Unable to connect to music service. Please check your internet connection.');
    }
    
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error('API request timed out:', error);
      throw new Error('Music service is taking too long to respond. Please try again.');
    }

    // Re-throw the error with context
    console.error('Failed to fetch tracks from public API:', error);
    throw error;
  }
}

/**
 * Check if public API is available and properly configured
 */
export function isPublicApiAvailable(): boolean {
  const isConfigured = !!PUBLIC_API_URL;
  
  if (!isConfigured) {
    console.warn('Public API URL not configured. Set VITE_PUBLIC_API_URL environment variable.');
  }
  
  return isConfigured;
}

/**
 * Get the configured API URL for debugging purposes
 */
export function getApiUrl(): string | undefined {
  return PUBLIC_API_URL;
}
