import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

// Mock isPublicUrl to accept https URLs
// isPublicUrl not mocked - real implementation works with test URLs.

import { PexelsTool } from '../pexels-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll footage',
    searchQuery: 'city skyline night',
    aspectRatio: '9:16',
    ...overrides,
  };
}

function makeVideoResponse(
  videos: Array<{
    duration: number;
    video_files: Array<{ link: string; width?: number; height?: number }>;
  }> = []
) {
  return { videos };
}

function makePhotoResponse(
  photos: Array<{
    src: { large2x: string; large: string };
    width: number;
    height: number;
  }> = []
) {
  return { photos };
}

describe('PexelsTool', () => {
  let tool: PexelsTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new PexelsTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.PEXELS_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when PEXELS_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'PEXELS_API_KEY not set' });
    });

    it('returns available when API responds ok', async () => {
      process.env.PEXELS_API_KEY = 'pexels-test-key';
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

      const result = await tool.healthCheck();

      expect(result).toEqual({ available: true });
    });

    it('returns unavailable when API responds with error', async () => {
      process.env.PEXELS_API_KEY = 'pexels-test-key';
      mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const result = await tool.healthCheck();

      expect(result).toEqual({ available: false, reason: 'Pexels API returned 401' });
    });

    it('returns unavailable when network fails', async () => {
      process.env.PEXELS_API_KEY = 'pexels-test-key';
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.healthCheck();

      expect(result.available).toBe(false);
      expect(result.reason).toContain('Connection refused');
    });
  });

  // ── generate (video search) ──────────────────────────────────

  describe('generate (video)', () => {
    beforeEach(() => {
      process.env.PEXELS_API_KEY = 'pexels-test-key';
    });

    it('sends search query to video endpoint with Authorization header', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 15,
                video_files: [
                  { link: 'https://cdn.pexels.com/video1.mp4', width: 720, height: 1280 },
                ],
              },
            ])
          ),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain('https://api.pexels.com/videos/search');
      expect(url).toContain('query=city%20skyline%20night');
      expect(url).toContain('per_page=5');
      expect(url).toContain('orientation=portrait');
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'pexels-test-key' })
      );
    });

    it('returns completed with best video URL', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 15,
                video_files: [
                  { link: 'https://cdn.pexels.com/video1.mp4', width: 720, height: 1280 },
                ],
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.pexels.com/video1.mp4');
      expect(result.durationSeconds).toBe(15);
    });

    it('calls addCost with zero cost for video', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 10,
                video_files: [
                  { link: 'https://cdn.pexels.com/video.mp4', width: 720, height: 1280 },
                ],
              },
            ])
          ),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest());

      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:pexels',
          provider: 'pexels',
          type: 'video',
          costUSD: 0,
        })
      );
    });

    it('prefers portrait videos (height > width)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 10,
                video_files: [
                  { link: 'https://cdn.pexels.com/landscape.mp4', width: 1920, height: 1080 },
                ],
              },
              {
                duration: 8,
                video_files: [
                  { link: 'https://cdn.pexels.com/portrait.mp4', width: 720, height: 1280 },
                ],
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result.url).toBe('https://cdn.pexels.com/portrait.mp4');
    });

    it('prefers video files <= 1080p width', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 10,
                video_files: [
                  { link: 'https://cdn.pexels.com/4k.mp4', width: 3840, height: 2160 },
                  { link: 'https://cdn.pexels.com/hd.mp4', width: 1080, height: 1920 },
                  { link: 'https://cdn.pexels.com/sd.mp4', width: 540, height: 960 },
                ],
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      // Should pick the 1080 one (highest <= 1080)
      expect(result.url).toBe('https://cdn.pexels.com/hd.mp4');
    });

    it('returns failed when no valid video results', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeVideoResponse([])), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No valid video results');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.PEXELS_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('PEXELS_API_KEY not set');
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(new Response('Rate limited', { status: 429 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Pexels 429');
    });

    it('filters out non-public URLs', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 10,
                video_files: [{ link: 'file:///etc/passwd', width: 720, height: 1280 }],
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No valid video results');
    });

    it('uses prompt as query fallback when searchQuery not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 10,
                video_files: [{ link: 'https://cdn.pexels.com/v.mp4', width: 720, height: 1280 }],
              },
            ])
          ),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest({ searchQuery: undefined, prompt: 'ocean waves' }));

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('query=ocean%20waves');
    });

    it('uses "abstract" as default query', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makeVideoResponse([
              {
                duration: 5,
                video_files: [{ link: 'https://cdn.pexels.com/v.mp4', width: 720, height: 1280 }],
              },
            ])
          ),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest({ searchQuery: undefined, prompt: undefined }));

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('query=abstract');
    });
  });

  // ── generate (image search) ─────────────────────────────────

  describe('generate (image)', () => {
    beforeEach(() => {
      process.env.PEXELS_API_KEY = 'pexels-test-key';
    });

    it('uses photo endpoint when query starts with "image:"', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makePhotoResponse([
              {
                src: {
                  large2x: 'https://images.pexels.com/photo-large2x.jpg',
                  large: 'https://images.pexels.com/photo-large.jpg',
                },
                width: 800,
                height: 1200,
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest({ searchQuery: 'image: sunset beach' }));

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('https://api.pexels.com/v1/search');
      expect(url).toContain('query=sunset%20beach');
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://images.pexels.com/photo-large2x.jpg');
    });

    it('calls addCost with zero cost for image', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makePhotoResponse([
              {
                src: {
                  large2x: 'https://images.pexels.com/photo.jpg',
                  large: 'https://images.pexels.com/photo-l.jpg',
                },
                width: 800,
                height: 1200,
              },
            ])
          ),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest({ searchQuery: 'image: cats' }));

      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'pexels',
          type: 'image',
          costUSD: 0,
        })
      );
    });

    it('prefers portrait photos', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makePhotoResponse([
              {
                src: {
                  large2x: 'https://images.pexels.com/landscape.jpg',
                  large: 'https://images.pexels.com/landscape-l.jpg',
                },
                width: 1600,
                height: 900,
              },
              {
                src: {
                  large2x: 'https://images.pexels.com/portrait.jpg',
                  large: 'https://images.pexels.com/portrait-l.jpg',
                },
                width: 800,
                height: 1200,
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest({ searchQuery: 'image: nature' }));

      expect(result.url).toBe('https://images.pexels.com/portrait.jpg');
    });

    it('returns failed when no valid image results', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makePhotoResponse([])), { status: 200 })
      );

      const result = await tool.generate(makeRequest({ searchQuery: 'image: unicorn' }));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No valid image results');
    });

    it('filters out non-public image URLs', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify(
            makePhotoResponse([
              {
                src: {
                  large2x: 'file:///private/photo.jpg',
                  large: 'file:///private/photo-l.jpg',
                },
                width: 800,
                height: 1200,
              },
            ])
          ),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest({ searchQuery: 'image: test' }));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No valid image results');
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('pexels');
      expect(tool.name).toBe('Pexels Stock');
    });

    it('declares both stock-video and stock-image capabilities', () => {
      expect(tool.capabilities).toHaveLength(2);
      const types = tool.capabilities.map((c) => c.assetType);
      expect(types).toContain('stock-video');
      expect(types).toContain('stock-image');
    });

    it('all capabilities are free and sync', () => {
      for (const cap of tool.capabilities) {
        expect(cap.costTier).toBe('free');
        expect(cap.isAsync).toBe(false);
      }
    });
  });
});
