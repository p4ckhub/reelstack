import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import {
  piapiKlingTool,
  piapiSeedanceTool,
  piapiHailuoTool,
  piapiFluxTool,
  piapiSeedance2Tool,
  piapiHunyuanTool,
  piapiKlingImg2VideoTool,
} from '../piapi-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('PiapiTool', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.PIAPI_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when PIAPI_KEY not set', async () => {
      const result = await piapiKlingTool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'PIAPI_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.PIAPI_KEY = 'piapi-test-key';
      const result = await piapiKlingTool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate (piapiKlingTool)', () => {
    beforeEach(() => {
      process.env.PIAPI_KEY = 'piapi-test-key';
    });

    it('sends correct request body with X-API-Key header', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { task_id: 'piapi-task-1' } }), {
          status: 200,
        })
      );

      await piapiKlingTool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.piapi.ai/api/v1/task');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'piapi-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('kling');
      expect(body.task_type).toBe('video_generation');
      expect(body.input.prompt).toBe('aerial view of a neon city at night');
      expect(body.input.negative_prompt).toBe('blurry, low quality');
      expect(body.input.duration).toBe(5);
      expect(body.input.aspect_ratio).toBe('9:16');
    });

    it('returns processing with task_id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { task_id: 'piapi-task-1' } }), {
          status: 200,
        })
      );

      const result = await piapiKlingTool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'piapi-task-1',
        toolId: 'kling-piapi',
        status: 'processing',
      });
    });

    it('returns failed when API key not set', async () => {
      delete process.env.PIAPI_KEY;

      const result = await piapiKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('PIAPI_KEY not set');
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(new Response('Bad Request', { status: 400 }));

      const result = await piapiKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('piapi API error (400)');
    });

    it('returns failed when no task_id returned', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 1, data: {} }), { status: 200 })
      );

      const result = await piapiKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No job ID returned');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await piapiKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  // ── generate (model-specific) ───────────────────────────────

  describe('generate (model-specific inputs)', () => {
    beforeEach(() => {
      process.env.PIAPI_KEY = 'piapi-test-key';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { task_id: 't1' } }), { status: 200 })
      );
    });

    it('piapiSeedanceTool uses seedance-2-fast-preview task_type', async () => {
      await piapiSeedanceTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('seedance');
      expect(body.task_type).toBe('seedance-2-fast-preview');
    });

    it('piapiSeedance2Tool uses seedance-2-preview task_type', async () => {
      await piapiSeedance2Tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.task_type).toBe('seedance-2-preview');
    });

    it('piapiHailuoTool uses txt2video and model_name in input', async () => {
      await piapiHailuoTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('hailuo');
      expect(body.task_type).toBe('txt2video');
      expect(body.input.model_name).toBe('t2v-01');
    });

    it('piapiFluxTool uses txt2img with width/height for 9:16', async () => {
      await piapiFluxTool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('Qubico/flux1-schnell');
      expect(body.task_type).toBe('txt2img');
      expect(body.input.width).toBe(720);
      expect(body.input.height).toBe(1280);
    });

    it('piapiFluxTool maps 16:9 to 1280x720', async () => {
      await piapiFluxTool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.width).toBe(1280);
      expect(body.input.height).toBe(720);
    });

    it('piapiFluxTool maps 1:1 to 1024x1024', async () => {
      await piapiFluxTool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.width).toBe(1024);
      expect(body.input.height).toBe(1024);
    });

    it('piapiKlingImg2VideoTool passes imageUrl', async () => {
      await piapiKlingImg2VideoTool.generate(
        makeRequest({ imageUrl: 'https://example.com/img.png' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.image_url).toBe('https://example.com/img.png');
    });

    it('piapiHunyuanTool sends correct model', async () => {
      await piapiHunyuanTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('Qubico/hunyuan');
      expect(body.task_type).toBe('txt2video');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'piapi-task-abc';

    beforeEach(() => {
      process.env.PIAPI_KEY = 'piapi-test-key';
    });

    it('returns completed with URL and calls addCost for Kling (works format)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'completed',
              output: {
                works: [{ resource: { resource: 'https://cdn.piapi.ai/video.mp4' } }],
              },
            },
          }),
          { status: 200 }
        )
      );

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.piapi.ai/video.mp4');
      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:kling-piapi',
          provider: 'piapi',
          model: 'kling',
          type: 'video',
        })
      );
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
    });

    it('returns completed for Seedance (video as string)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'completed',
              output: { video: 'https://cdn.piapi.ai/seedance-video.mp4' },
            },
          }),
          { status: 200 }
        )
      );

      const result = await piapiSeedanceTool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.piapi.ai/seedance-video.mp4');
    });

    it('returns completed for Hailuo (video as object with url)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'completed',
              output: { video: { url: 'https://cdn.piapi.ai/hailuo.mp4' } },
            },
          }),
          { status: 200 }
        )
      );

      const result = await piapiHailuoTool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.piapi.ai/hailuo.mp4');
    });

    it('returns completed for Flux (image_url)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'completed',
              output: { image_url: 'https://cdn.piapi.ai/img.png' },
            },
          }),
          { status: 200 }
        )
      );

      const result = await piapiFluxTool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.piapi.ai/img.png');
    });

    it('returns completed for Hunyuan (video_url)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'completed',
              output: { video_url: 'https://cdn.piapi.ai/hunyuan.mp4' },
            },
          }),
          { status: 200 }
        )
      );

      const result = await piapiHunyuanTool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.piapi.ai/hunyuan.mp4');
    });

    it('returns failed on failed status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'failed',
              error: { message: 'Content moderation triggered' },
            },
          }),
          { status: 200 }
        )
      );

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content moderation triggered');
    });

    it('returns failed with default message when no error message', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'failed' } }), { status: 200 })
      );

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('piapi generation failed');
    });

    it('returns failed when completed but no URL', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'completed', output: {} } }), { status: 200 })
      );

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in result');
    });

    it('returns processing for pending/processing status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'processing' } }), { status: 200 })
      );

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing when no task data', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: null }), { status: 200 }));

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on non-ok HTTP status', async () => {
      mockFetch.mockResolvedValue(new Response('Error', { status: 500 }));

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('rejects invalid jobId format', async () => {
      const result = await piapiKlingTool.poll!('job id with spaces & special <chars>');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects empty jobId', async () => {
      const result = await piapiKlingTool.poll!('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.PIAPI_KEY;

      const result = await piapiKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('PIAPI_KEY not set');
    });

    it('sends GET request to correct endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'processing' } }), { status: 200 })
      );

      await piapiKlingTool.poll!(JOB_ID);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.piapi.ai/api/v1/task/${JOB_ID}`);
      expect(options.headers).toEqual(expect.objectContaining({ 'X-API-Key': 'piapi-test-key' }));
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('piapiKlingTool has correct id', () => {
      expect(piapiKlingTool.id).toBe('kling-piapi');
    });

    it('piapiFluxTool is an image tool', () => {
      expect(piapiFluxTool.capabilities[0]!.assetType).toBe('ai-image');
    });

    it('piapiSeedanceTool has moderate cost tier', () => {
      expect(piapiSeedanceTool.capabilities[0]!.costTier).toBe('moderate');
    });
  });
});
