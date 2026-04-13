import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import {
  replicateWanTool,
  replicateFluxTool,
  replicateSdxlTool,
  replicateIdeogramTool,
  replicateRecraftTool,
  replicateFluxProTool,
} from '../replicate-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('Replicate Tools', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.REPLICATE_API_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── replicateWanTool (video) ─────────────────────────────────

  describe('replicateWanTool', () => {
    describe('static properties', () => {
      it('has correct id and name', () => {
        expect(replicateWanTool.id).toBe('wan-replicate');
        expect(replicateWanTool.name).toBe('WAN 2.1 via Replicate');
      });

      it('declares ai-video capability with async polling', () => {
        const cap = replicateWanTool.capabilities[0]!;
        expect(cap.assetType).toBe('ai-video');
        expect(cap.isAsync).toBe(true);
        expect(cap.costTier).toBe('cheap');
        expect(cap.maxDurationSeconds).toBe(5);
      });
    });

    describe('healthCheck', () => {
      it('returns unavailable when REPLICATE_API_TOKEN not set', async () => {
        const result = await replicateWanTool.healthCheck();
        expect(result).toEqual({ available: false, reason: 'REPLICATE_API_TOKEN not set' });
      });

      it('returns available when token is set', async () => {
        process.env.REPLICATE_API_TOKEN = 'r8_test_token';
        const result = await replicateWanTool.healthCheck();
        expect(result).toEqual({ available: true });
      });
    });

    describe('generate', () => {
      beforeEach(() => {
        process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      });

      it('returns failed when token not set', async () => {
        delete process.env.REPLICATE_API_TOKEN;

        const result = await replicateWanTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('REPLICATE_API_TOKEN not set');
      });

      it('sends correct request to Replicate predictions endpoint', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'starting' }), { status: 201 })
        );

        await replicateWanTool.generate(makeRequest({ durationSeconds: 5 }));

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toBe(
          'https://api.replicate.com/v1/models/wan-video/wan-2.1-t2v-480p/predictions'
        );
        expect(options.method).toBe('POST');
        expect(options.headers).toEqual(
          expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer r8_test_token',
            Prefer: 'respond-async',
          })
        );

        const body = JSON.parse(options.body as string);
        expect(body.input.prompt).toBe('aerial view of a neon city at night');
        expect(body.input.num_frames).toBe(80); // 5 * 16
        expect(body.input.fps).toBe(16);
        expect(body.input.fast_mode).toBe(true);
      });

      it('calculates num_frames from duration and fps', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'starting' }), { status: 201 })
        );

        await replicateWanTool.generate(makeRequest({ durationSeconds: 3 }));

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.input.num_frames).toBe(48); // 3 * 16
      });

      it('returns processing with prediction id on success', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'starting' }), { status: 201 })
        );

        const result = await replicateWanTool.generate(makeRequest());

        expect(result.status).toBe('processing');
        expect(result.jobId).toBe('pred-abc');
        expect(result.toolId).toBe('wan-replicate');
      });

      it('returns failed when no id in response', async () => {
        mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

        const result = await replicateWanTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No job ID returned');
      });

      it('returns failed on API error', async () => {
        mockFetch.mockResolvedValue(new Response('{"detail": "Invalid token"}', { status: 401 }));

        const result = await replicateWanTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('replicate API error (401)');
      });

      it('returns failed on 422 validation error', async () => {
        mockFetch.mockResolvedValue(new Response('{"detail": "Invalid input"}', { status: 422 }));

        const result = await replicateWanTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('replicate API error (422)');
      });

      it('handles network error gracefully', async () => {
        mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

        const result = await replicateWanTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toContain('ENOTFOUND');
      });

      it('does not call addCost on generate (async tool)', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'starting' }), { status: 201 })
        );

        await replicateWanTool.generate(makeRequest());

        expect(mockAddCost).not.toHaveBeenCalled();
      });
    });

    describe('poll', () => {
      beforeEach(() => {
        process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      });

      it('returns failed when token not set', async () => {
        delete process.env.REPLICATE_API_TOKEN;

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('REPLICATE_API_TOKEN not set');
      });

      it('returns failed for empty jobId', async () => {
        const result = await replicateWanTool.poll!('');
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Invalid jobId format');
      });

      it('returns failed for jobId exceeding max length', async () => {
        const result = await replicateWanTool.poll!('a'.repeat(513));
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Invalid jobId format');
      });

      it('returns failed for jobId with invalid characters', async () => {
        const result = await replicateWanTool.poll!('pred<script>alert(1)</script>');
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Invalid jobId format');
      });

      it('sends correct poll request', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'processing' }), { status: 200 })
        );

        await replicateWanTool.poll!('pred-abc');

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.replicate.com/v1/predictions/pred-abc');
        expect(options.headers).toEqual(
          expect.objectContaining({ Authorization: 'Bearer r8_test_token' })
        );
      });

      it('returns completed with URL when output is a string', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'pred-abc',
              status: 'succeeded',
              output: 'https://replicate.delivery/video.mp4',
            }),
            { status: 200 }
          )
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('completed');
        expect(result.url).toBe('https://replicate.delivery/video.mp4');
      });

      it('returns completed with URL when output is an array', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'pred-abc',
              status: 'succeeded',
              output: ['https://replicate.delivery/video.mp4'],
            }),
            { status: 200 }
          )
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('completed');
        expect(result.url).toBe('https://replicate.delivery/video.mp4');
      });

      it('calls addCost on successful poll', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'pred-abc',
              status: 'succeeded',
              output: 'https://replicate.delivery/video.mp4',
            }),
            { status: 200 }
          )
        );

        await replicateWanTool.poll!('pred-abc');

        expect(mockAddCost).toHaveBeenCalledOnce();
        expect(mockAddCost).toHaveBeenCalledWith(
          expect.objectContaining({
            step: 'asset:wan-replicate',
            provider: 'replicate',
            model: 'wan-video/wan-2.1-t2v-480p',
            type: 'video',
            inputUnits: 1,
          })
        );
      });

      it('returns failed when succeeded but output is null', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'succeeded', output: null }), {
            status: 200,
          })
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No URL in result');
      });

      it('returns failed when succeeded but output is empty array', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'succeeded', output: [] }), {
            status: 200,
          })
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No URL in result');
      });

      it('returns failed with error when status is failed', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({ id: 'pred-abc', status: 'failed', error: 'Model execution failed' }),
            { status: 200 }
          )
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Model execution failed');
      });

      it('returns failed with default error when status is failed without error message', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'failed' }), { status: 200 })
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('replicate generation failed');
      });

      it('returns failed when status is canceled', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'canceled' }), { status: 200 })
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('replicate generation failed');
      });

      it('returns processing for starting status', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'starting' }), { status: 200 })
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('processing');
      });

      it('returns processing for processing status', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'processing' }), { status: 200 })
        );

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('processing');
      });

      it('returns processing when API returns non-OK status', async () => {
        mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('processing');
      });

      it('returns processing on network error', async () => {
        mockFetch.mockRejectedValue(new Error('Timeout'));

        const result = await replicateWanTool.poll!('pred-abc');

        expect(result.status).toBe('processing');
      });

      it('does not call addCost when still processing', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pred-abc', status: 'processing' }), { status: 200 })
        );

        await replicateWanTool.poll!('pred-abc');

        expect(mockAddCost).not.toHaveBeenCalled();
      });
    });
  });

  // ── replicateFluxTool (image) ────────────────────────────────

  describe('replicateFluxTool', () => {
    it('has correct id and name', () => {
      expect(replicateFluxTool.id).toBe('flux-replicate');
      expect(replicateFluxTool.name).toBe('FLUX Schnell via Replicate');
    });

    it('declares ai-image capability', () => {
      const cap = replicateFluxTool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-image');
      expect(cap.isAsync).toBe(true);
      expect(cap.costTier).toBe('cheap');
    });

    it('builds input with correct parameters', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-flux', status: 'starting' }), { status: 201 })
      );

      await replicateFluxTool.generate(makeRequest({ aspectRatio: '1:1' }));

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions'
      );

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.aspect_ratio).toBe('1:1');
      expect(body.input.num_outputs).toBe(1);
      expect(body.input.output_format).toBe('webp');
      expect(body.input.output_quality).toBe(90);
    });

    it('uses default prompt when not provided', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-flux', status: 'starting' }), { status: 201 })
      );

      await replicateFluxTool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.prompt).toBe('abstract background');
    });
  });

  // ── replicateSdxlTool ────────────────────────────────────────

  describe('replicateSdxlTool', () => {
    it('has correct id and name', () => {
      expect(replicateSdxlTool.id).toBe('sdxl-replicate');
      expect(replicateSdxlTool.name).toBe('SDXL via Replicate');
    });

    it('builds input with correct dimensions for 9:16', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-sdxl', status: 'starting' }), { status: 201 })
      );

      await replicateSdxlTool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.width).toBe(576);
      expect(body.input.height).toBe(1024);
      expect(body.input.negative_prompt).toBe('blurry, low quality, distorted');
    });

    it('builds input with correct dimensions for 16:9', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-sdxl', status: 'starting' }), { status: 201 })
      );

      await replicateSdxlTool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.width).toBe(1280);
      expect(body.input.height).toBe(720);
    });

    it('builds input with correct dimensions for 1:1', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-sdxl', status: 'starting' }), { status: 201 })
      );

      await replicateSdxlTool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.width).toBe(1024);
      expect(body.input.height).toBe(1024);
    });
  });

  // ── replicateIdeogramTool ────────────────────────────────────

  describe('replicateIdeogramTool', () => {
    it('has correct id and name', () => {
      expect(replicateIdeogramTool.id).toBe('ideogram-replicate');
      expect(replicateIdeogramTool.name).toBe('Ideogram v3 via Replicate');
    });

    it('declares moderate cost tier', () => {
      expect(replicateIdeogramTool.capabilities[0]!.costTier).toBe('moderate');
    });

    it('builds input with correct parameters', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-ideo', status: 'starting' }), { status: 201 })
      );

      await replicateIdeogramTool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        'https://api.replicate.com/v1/models/ideogram-ai/ideogram-v3-balanced/predictions'
      );

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.rendering_speed).toBe('BALANCED');
      expect(body.input.aspect_ratio).toBe('9:16');
    });
  });

  // ── replicateRecraftTool ─────────────────────────────────────

  describe('replicateRecraftTool', () => {
    it('has correct id and name', () => {
      expect(replicateRecraftTool.id).toBe('recraft-replicate');
      expect(replicateRecraftTool.name).toBe('Recraft v3 via Replicate');
    });

    it('builds input with correct size for 9:16', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-recraft', status: 'starting' }), { status: 201 })
      );

      await replicateRecraftTool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.size).toBe('1024x1820');
      expect(body.input.style).toBe('realistic_image');
    });

    it('builds input with correct size for 16:9', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-recraft', status: 'starting' }), { status: 201 })
      );

      await replicateRecraftTool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.size).toBe('1820x1024');
    });

    it('builds input with correct size for 1:1', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-recraft', status: 'starting' }), { status: 201 })
      );

      await replicateRecraftTool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.size).toBe('1024x1024');
    });
  });

  // ── replicateFluxProTool ─────────────────────────────────────

  describe('replicateFluxProTool', () => {
    it('has correct id and name', () => {
      expect(replicateFluxProTool.id).toBe('flux-pro-replicate');
      expect(replicateFluxProTool.name).toBe('FLUX Pro via Replicate');
    });

    it('builds input with correct parameters', async () => {
      process.env.REPLICATE_API_TOKEN = 'r8_test_token';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'pred-fluxpro', status: 'starting' }), { status: 201 })
      );

      await replicateFluxProTool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        'https://api.replicate.com/v1/models/black-forest-labs/flux-pro/predictions'
      );

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.output_format).toBe('webp');
      expect(body.input.output_quality).toBe(90);
      expect(body.input.safety_tolerance).toBe(5);
    });
  });
});
