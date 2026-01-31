/**
 * Public API Service
 * Fetches data from the public Lambda Function URL (no auth required)
 */

import { AudioTrackWithUrls } from '../types/audio-track';

const PUBLIC_API_URL = import.meta.env.VITE_PUBLIC_API_URL || 'https://ujgiy4p7xwuvfizeqr5pcahvj40hxhpa.lambda-url.us-west-2.on.aws/tracks';

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
 */
export async function fetchTracksFromPublicApi(
  options: FetchTracksOptions = {}
): Promise<AudioTrackWithUrls[]> {
  if (!PUBLIC_API_URL) {
    throw new Error('Public API URL not configured');
  }

  const { limit = 100, status = 'processed' } = options;

  const url = new URL(PUBLIC_API_URL);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('status', status);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tracks: ${response.statusText}`);
  }

  const data: FetchTracksResponse = await response.json();

  // Transform the data to match AudioTrackWithUrls interface
  return data.tracks.map((track) => ({
    id: track.id,
    title: track.title,
    fileUrl: track.fileUrl,
    secureUrl: track.fileUrl, // Use the same URL (CloudFront)
    duration: track.duration,
    description: track.description || '',
    createdDate: new Date(track.createdDate),
    genre: track.genre || 'Unknown',
    tags: track.tags || [],
    streamingLinks: track.streamingLinks || [],
  }));
}

/**
 * Check if public API is available
 */
export function isPublicApiAvailable(): boolean {
  return !!PUBLIC_API_URL;
}
