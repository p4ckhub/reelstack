import type { MediaAsset } from './types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('media-library');
const PEXELS_API = 'https://api.pexels.com';

/**
 * Searches Pexels for stock video clips matching keywords.
 * Returns URLs usable in Remotion compositions.
 */
export async function searchPexelsVideos(
  query: string,
  options?: { perPage?: number; orientation?: 'landscape' | 'portrait' },
): Promise<MediaAsset[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(options?.perPage ?? 5),
    orientation: options?.orientation ?? 'portrait',
  });

  const response = await fetch(`${PEXELS_API}/videos/search?${params}`, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    log.warn({ status: response.status, query }, 'Pexels video search failed');
    return [];
  }

  const data = (await response.json()) as PexelsVideoResponse;

  return data.videos.map((v) => {
    // Prefer HD quality, portrait orientation
    const file = v.video_files
      .filter((f) => f.width && f.height && f.width <= 1080)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
      ?? v.video_files[0];

    return {
      url: file?.link ?? '',
      type: 'video' as const,
      tags: query.split(' '),
      durationSeconds: v.duration,
    };
  }).filter((a) => a.url);
}

/**
 * Searches Pexels for stock images matching keywords.
 */
export async function searchPexelsImages(
  query: string,
  options?: { perPage?: number; orientation?: 'landscape' | 'portrait' },
): Promise<MediaAsset[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(options?.perPage ?? 5),
    orientation: options?.orientation ?? 'portrait',
  });

  const response = await fetch(`${PEXELS_API}/v1/search?${params}`, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    log.warn({ status: response.status, query }, 'Pexels image search failed');
    return [];
  }

  const data = (await response.json()) as PexelsPhotoResponse;

  return data.photos.map((p) => ({
    url: p.src.large2x ?? p.src.large,
    type: 'image' as const,
    tags: query.split(' '),
  }));
}

interface PexelsVideoResponse {
  videos: Array<{
    duration: number;
    video_files: Array<{
      link: string;
      width?: number;
      height?: number;
      quality?: string;
    }>;
  }>;
}

interface PexelsPhotoResponse {
  photos: Array<{
    src: { large2x: string; large: string };
  }>;
}
