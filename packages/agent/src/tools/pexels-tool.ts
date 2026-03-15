import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob } from '../types';
import { isPublicUrl } from '../planner/production-planner';
import { PEXELS_GUIDELINES } from './prompt-guidelines';
import { createLogger } from '@reelstack/logger';

const log = createLogger('pexels-tool');
const PEXELS_API = 'https://api.pexels.com';

/**
 * Stock footage tool wrapping the Pexels API.
 * Supports both video and image search.
 */
export class PexelsTool implements ProductionTool {
  readonly id = 'pexels';
  readonly name = 'Pexels Stock';
  readonly promptGuidelines = PEXELS_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'stock-video',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 2000,
      isAsync: false,
      costTier: 'free',
    },
    {
      assetType: 'stock-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 2000,
      isAsync: false,
      costTier: 'free',
    },
  ];

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return { available: false, reason: 'PEXELS_API_KEY not set' };

    try {
      const res = await fetch(`${PEXELS_API}/videos/search?query=test&per_page=1`, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? { available: true }
        : { available: false, reason: `Pexels API returned ${res.status}` };
    } catch (err) {
      return {
        available: false,
        reason: `Pexels unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'PEXELS_API_KEY not set',
      };
    }

    const rawQuery = request.searchQuery || request.prompt || 'abstract';
    const isVideo = !rawQuery.includes('image:');
    const query = rawQuery.replace(/^image:\s*/, '');

    const url = isVideo
      ? `${PEXELS_API}/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait`
      : `${PEXELS_API}/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait`;

    const startTime = performance.now();

    log.info({ query, isVideo, endpoint: url }, 'Pexels search request');

    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      log.warn({ status: res.status, durationMs, query }, 'Pexels search failed');
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `Pexels ${res.status}`,
      };
    }

    const data = await res.json();

    if (isVideo) {
      const videos = (data as PexelsVideoResponse).videos ?? [];
      log.info(
        { query, durationMs, resultsCount: videos.length, type: 'video' },
        'Pexels search completed'
      );
      // Prefer portrait-oriented videos (height > width), then highest quality ≤1080p
      const bestVideo = videos
        .map((v) => {
          const file =
            v.video_files
              ?.filter((f) => f.width && f.width <= 1080)
              .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0] ?? v.video_files?.[0];
          const isPortrait = file && file.height && file.width ? file.height > file.width : false;
          return { video: v, file, isPortrait };
        })
        .filter((r) => r.file?.link && isPublicUrl(r.file.link))
        .sort((a, b) => (b.isPortrait ? 1 : 0) - (a.isPortrait ? 1 : 0))[0];

      if (!bestVideo?.file?.link) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No valid video results',
        };
      }

      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'completed',
        url: bestVideo.file.link,
        durationSeconds: bestVideo.video?.duration,
      };
    }

    const photos = (data as PexelsPhotoResponse).photos ?? [];
    log.info(
      { query, durationMs, resultsCount: photos.length, type: 'photo' },
      'Pexels search completed'
    );
    // Prefer portrait-oriented photos, then highest resolution
    const bestPhoto = photos
      .filter((p) => {
        const url = p.src.large2x ?? p.src.large;
        return url && isPublicUrl(url);
      })
      .sort((a, b) => {
        const aPortrait = a.height > a.width ? 1 : 0;
        const bPortrait = b.height > b.width ? 1 : 0;
        return bPortrait - aPortrait;
      })[0];

    if (!bestPhoto) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'No valid image results',
      };
    }

    return {
      jobId: randomUUID(),
      toolId: this.id,
      status: 'completed',
      url: bestPhoto.src.large2x ?? bestPhoto.src.large,
    };
  }
}

interface PexelsVideoResponse {
  videos: Array<{
    duration: number;
    video_files: Array<{ link: string; width?: number; height?: number }>;
  }>;
}

interface PexelsPhotoResponse {
  photos: Array<{ src: { large2x: string; large: string }; width: number; height: number }>;
}
