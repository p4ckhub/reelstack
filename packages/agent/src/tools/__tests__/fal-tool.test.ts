import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { falTools, getFalTool } from '../fal-tool';
import type { ProductionTool } from '../../registry/tool-interface';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('FalTool', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.FAL_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── getFalTool / falTools ──────────────────────────────────────

  describe('getFalTool', () => {
    it('returns a tool by id', () => {
      const tool = getFalTool('kling-fal');
      expect(tool).toBeDefined();
      expect(tool!.id).toBe('kling-fal');
    });

    it('returns undefined for unknown id', () => {
      expect(getFalTool('nonexistent-tool')).toBeUndefined();
    });
  });

  describe('falTools catalog', () => {
    it('contains all expected video tools', () => {
      const ids = falTools.map((t) => t.id);
      expect(ids).toContain('kling-fal');
      expect(ids).toContain('kling-std-fal');
      expect(ids).toContain('seedance-fal');
      expect(ids).toContain('wan-fal');
      expect(ids).toContain('hailuo-fal');
      expect(ids).toContain('pika22-fal');
      expect(ids).toContain('ltx23-fal');
      expect(ids).toContain('luma-fal');
    });

    it('contains all expected image tools', () => {
      const ids = falTools.map((t) => t.id);
      expect(ids).toContain('flux-fal');
      expect(ids).toContain('flux-pro-fal');
      expect(ids).toContain('nanobanana2-fal');
      expect(ids).toContain('ideogram-fal');
      expect(ids).toContain('recraft-fal');
      expect(ids).toContain('sd35-fal');
      expect(ids).toContain('seedream45-fal');
      expect(ids).toContain('imagen4-fal');
    });

    it('all tools have unique ids', () => {
      const ids = falTools.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('video tools declare ai-video asset type', () => {
      const videoTool = getFalTool('kling-fal')!;
      expect(videoTool.capabilities[0]!.assetType).toBe('ai-video');
      expect(videoTool.capabilities[0]!.isAsync).toBe(true);
    });

    it('image tools declare ai-image asset type', () => {
      const imageTool = getFalTool('flux-fal')!;
      expect(imageTool.capabilities[0]!.assetType).toBe('ai-image');
    });
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when FAL_KEY not set', async () => {
      const tool = getFalTool('kling-fal')!;
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'FAL_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.FAL_KEY = 'fal-test-key';
      const tool = getFalTool('kling-fal')!;
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate (Kling video) ────────────────────────────────────

  describe('generate (kling-fal)', () => {
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('kling-fal')!;
    });

    it('sends correct request to fal queue endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'fal-req-123' }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://queue.fal.run/fal-ai/kling-video/v3/pro/text-to-video');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Key fal-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.prompt).toBe('aerial view of a neon city at night');
      expect(body.duration).toBe(5);
      expect(body.aspect_ratio).toBe('9:16');
    });

    it('returns processing with request_id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'fal-req-123' }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'fal-req-123',
        toolId: 'kling-fal',
        status: 'processing',
      });
    });

    it('returns failed when API key not set', async () => {
      delete process.env.FAL_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('FAL_KEY not set');
      expect(result.toolId).toBe('kling-fal');
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(new Response('{"detail":"Unauthorized"}', { status: 401 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('fal API error (401)');
    });

    it('handles 429 rate limit', async () => {
      mockFetch.mockResolvedValue(new Response('Rate limit exceeded', { status: 429 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('fal API error (429)');
    });

    it('handles 500 server error', async () => {
      mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('fal API error (500)');
    });

    it('returns failed when no request_id returned', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No request_id returned');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Network timeout');
    });

    it('handles non-Error thrown objects', async () => {
      mockFetch.mockRejectedValue('string error');

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('unknown');
    });

    it('uses default prompt when none provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('abstract cinematic background');
    });

    it('clamps duration to [5, 10]', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 1 }));
      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(5);

      mockFetch.mockClear();
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 30 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(10);
    });
  });

  // ── generate (image tools) ────────────────────────────────────

  describe('generate (flux-fal image)', () => {
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('flux-fal')!;
    });

    it('sends image_size mapped from aspect ratio for 9:16', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_size).toBe('portrait_16_9');
      expect(body.num_inference_steps).toBe(4);
    });

    it('maps 16:9 to landscape_16_9', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_size).toBe('landscape_16_9');
    });

    it('maps 1:1 to square', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_size).toBe('square');
    });

    it('uses default prompt for images', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('abstract background');
    });
  });

  describe('generate (imagen4-fal image with aspect_ratio)', () => {
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('imagen4-fal')!;
    });

    it('passes aspect_ratio directly instead of image_size', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('9:16');
      expect(body.safety_filter_level).toBe('block_only_high');
      expect(body.image_size).toBeUndefined();
    });
  });

  describe('generate (kling-img2video-fal)', () => {
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('kling-img2video-fal')!;
    });

    it('passes image_url from request', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ imageUrl: 'https://example.com/frame.png' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_url).toBe('https://example.com/frame.png');
    });

    it('falls back to referenceImageUrl when imageUrl not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ referenceImageUrl: 'https://example.com/ref.png' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_url).toBe('https://example.com/ref.png');
    });
  });

  describe('generate (model-specific inputs)', () => {
    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
    });

    it('wan-fal sends num_frames based on duration', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('wan-fal')!;
      await tool.generate(makeRequest({ durationSeconds: 5 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.num_frames).toBe(80); // 5 * 16
      expect(body.resolution).toBe('480p');
    });

    it('hailuo-fal sends only prompt', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('hailuo-fal')!;
      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('aerial view of a neon city at night');
      expect(body.duration).toBeUndefined();
    });

    it('seedance-fal sends duration_seconds', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('seedance-fal')!;
      await tool.generate(makeRequest({ durationSeconds: 7 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration_seconds).toBe(7);
    });

    it('pika22-fal rounds duration to 5 or 10', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('pika22-fal')!;
      await tool.generate(makeRequest({ durationSeconds: 3 }));

      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(5);

      mockFetch.mockClear();
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 8 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(10);
    });

    it('luma-fal sends duration as string "5s" or "10s"', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('luma-fal')!;
      await tool.generate(makeRequest({ durationSeconds: 4 }));

      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe('5s');

      mockFetch.mockClear();
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 8 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe('10s');
    });

    it('ltx23-fal includes negative_prompt', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('ltx23-fal')!;
      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.negative_prompt).toBe(
        'blurry, low quality, distorted, flickering, worst quality'
      );
    });

    it('recraft-fal includes style parameter', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('recraft-fal')!;
      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.style).toBe('realistic_image');
    });

    it('sd35-fal includes inference steps and cfg_scale', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ request_id: 'r1' }), { status: 200 })
      );

      const tool = getFalTool('sd35-fal')!;
      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.num_inference_steps).toBe(28);
      expect(body.cfg_scale).toBe(4.5);
      expect(body.negative_prompt).toContain('blurry');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll (video tool)', () => {
    const JOB_ID = 'fal-req-abc';
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('kling-fal')!;
    });

    it('returns completed with URL after status check and result fetch', async () => {
      // First call: status check returns COMPLETED
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        // Second call: result fetch returns video
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ video: { url: 'https://fal.ai/video.mp4', duration: 5.2 } }),
            { status: 200 }
          )
        );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://fal.ai/video.mp4');
      expect(result.durationSeconds).toBe(5.2);
      expect(result.toolId).toBe('kling-fal');

      // Verify two fetch calls were made
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: status endpoint
      const [statusUrl] = mockFetch.mock.calls[0]!;
      expect(statusUrl).toBe(
        `https://queue.fal.run/fal-ai/kling-video/v3/pro/text-to-video/requests/${JOB_ID}/status`
      );

      // Second call: result endpoint
      const [resultUrl] = mockFetch.mock.calls[1]!;
      expect(resultUrl).toBe(
        `https://queue.fal.run/fal-ai/kling-video/v3/pro/text-to-video/requests/${JOB_ID}`
      );
    });

    it('calls addCost with correct parameters on completed', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ video: { url: 'https://fal.ai/video.mp4', duration: 7 } }),
            { status: 200 }
          )
        );

      await tool.poll!(JOB_ID);

      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:kling-fal');
      expect(costCall?.provider).toBe('fal');
      expect(costCall?.model).toBe('kling-fal');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('returns failed on FAILED status', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'FAILED', error: { msg: 'Content policy violation' } }),
          { status: 200 }
        )
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content policy violation');
      // Should NOT make a second fetch for result
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('returns failed with default message when FAILED has no error message', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'FAILED' }), { status: 200 })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('fal generation failed');
    });

    it('returns processing for IN_QUEUE status', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IN_QUEUE' }), { status: 200 })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('returns processing for IN_PROGRESS status', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IN_PROGRESS' }), { status: 200 })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on non-ok HTTP status from status check', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns failed when result fetch fails after status is COMPLETED', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('fal result error (404)');
    });

    it('returns failed when COMPLETED but no URL in result', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ video: {} }), { status: 200 }));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in fal result');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('rejects invalid jobId format', async () => {
      const result = await tool.poll!('../../../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects empty jobId', async () => {
      const result = await tool.poll!('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects jobId exceeding 256 chars', async () => {
      const result = await tool.poll!('a'.repeat(257));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.FAL_KEY;

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('FAL_KEY not set');
    });

    it('sends Authorization header with Key prefix', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IN_QUEUE' }), { status: 200 })
      );

      await tool.poll!(JOB_ID);

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Key fal-test-key' })
      );
    });
  });

  // ── poll (image tool) ─────────────────────────────────────────

  describe('poll (image tool)', () => {
    const JOB_ID = 'fal-img-req';
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('flux-fal')!;
    });

    it('returns completed with image URL from images array', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ images: [{ url: 'https://fal.ai/image.png' }] }), {
            status: 200,
          })
        );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://fal.ai/image.png');
      expect(result.durationSeconds).toBeUndefined();
    });

    it('returns failed when images array is empty', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ images: [] }), { status: 200 }));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in fal result');
    });

    it('calls addCost on successful image poll', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ images: [{ url: 'https://fal.ai/img.png' }] }), {
            status: 200,
          })
        );

      await tool.poll!(JOB_ID);

      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:flux-fal',
          provider: 'fal',
          model: 'flux-fal',
          type: 'video', // FalTool always reports 'video' type in addCost
        })
      );
    });
  });

  // ── poll (handles valid jobId edge cases) ─────────────────────

  describe('poll (jobId validation)', () => {
    let tool: ProductionTool;

    beforeEach(() => {
      process.env.FAL_KEY = 'fal-test-key';
      tool = getFalTool('kling-fal')!;
    });

    it('accepts jobId with dots and tildes', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IN_QUEUE' }), { status: 200 })
      );

      const result = await tool.poll!('abc-123.def~456:789');

      expect(result.status).toBe('processing');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('accepts jobId at exactly 256 chars', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IN_QUEUE' }), { status: 200 })
      );

      const result = await tool.poll!('a'.repeat(256));

      expect(result.status).toBe('processing');
    });

    it('rejects jobId with spaces', async () => {
      const result = await tool.poll!('job id with spaces');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });
  });
});
