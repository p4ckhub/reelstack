import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import {
  wavespeedSeedanceTool,
  wavespeedWanTool,
  wavespeedFluxTool,
  wavespeedNanaBananaProTool,
  wavespeedWan26Tool,
  wavespeedQwenImageTool,
} from '../wavespeed-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'a futuristic city skyline at dusk',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('WavespeedTool (Seedance instance)', () => {
  const tool = wavespeedSeedanceTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.WAVESPEED_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when WAVESPEED_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'WAVESPEED_API_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.WAVESPEED_API_KEY = 'ws-test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.WAVESPEED_API_KEY = 'ws-test-key';
    });

    it('sends correct request to model-specific endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'ws-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.wavespeed.ai/api/v3/bytedance/seedance-1-lite-t2v-480p');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer ws-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.prompt).toBe('a futuristic city skyline at dusk');
      expect(body.num_frames).toBe(80); // 5 * 16
    });

    it('returns processing with task id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'ws-task-1' } }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'ws-task-1',
        toolId: 'seedance-wavespeed',
        status: 'processing',
      });
    });

    it('returns failed when API key not set', async () => {
      delete process.env.WAVESPEED_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('WAVESPEED_API_KEY not set');
      expect(result.toolId).toBe('seedance-wavespeed');
    });

    it('handles HTTP error response', async () => {
      mockFetch.mockResolvedValue(new Response('{"error": "Unauthorized"}', { status: 401 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('wavespeed API error (401)');
    });

    it('returns failed when no task id in response', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No job ID returned');
    });

    it('returns failed when data is null', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No job ID returned');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('DNS resolution failed');
    });

    it('uses default prompt when none provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'ws-task-2' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('abstract cinematic background');
    });

    it('computes num_frames from durationSeconds', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'ws-task-3' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 3 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.num_frames).toBe(48); // 3 * 16
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'ws-task-abc-123';

    beforeEach(() => {
      process.env.WAVESPEED_API_KEY = 'ws-test-key';
    });

    it('returns completed with URL and calls addCost', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { status: 'completed', outputs: ['https://cdn.wavespeed.ai/video.mp4'] },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.wavespeed.ai/video.mp4');
      expect(result.toolId).toBe('seedance-wavespeed');
      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:seedance-wavespeed');
      expect(costCall?.provider).toBe('wavespeed');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('sends GET to correct results endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'processing' } }), { status: 200 })
      );

      await tool.poll!(JOB_ID);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.wavespeed.ai/api/v3/results/${JOB_ID}`);
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer ws-test-key' })
      );
    });

    it('returns processing when status is not completed or failed', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'processing' } }), { status: 200 })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'seedance-wavespeed', status: 'processing' });
    });

    it('returns processing when data is missing', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.poll!(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'seedance-wavespeed', status: 'processing' });
    });

    it('returns failed on failed status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'failed', error: 'Model overloaded' } }), {
          status: 200,
        })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Model overloaded');
    });

    it('returns failed with default message when no error detail', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'failed' } }), { status: 200 })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('wavespeed generation failed');
    });

    it('returns failed when completed but no output URL', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'completed', outputs: [] } }), {
          status: 200,
        })
      );

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in result');
    });

    it('returns processing on non-ok HTTP status', async () => {
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection reset'));

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.WAVESPEED_API_KEY;

      const result = await tool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('WAVESPEED_API_KEY not set');
    });

    // ── jobId validation ─────────────────────────────────────

    it('rejects jobId with disallowed characters', async () => {
      // ProviderTool regex allows alphanumeric, -, _, ., ~, :, /
      // but rejects spaces, brackets, etc.
      const result = await tool.poll!('job id [bad]');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects empty jobId', async () => {
      const result = await tool.poll!('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects jobId exceeding 512 chars', async () => {
      const result = await tool.poll!('a'.repeat(513));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('accepts valid jobId with colons (wavespeed uses them)', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { status: 'processing' } }), { status: 200 })
      );

      const result = await tool.poll!('task:abc-123');

      expect(result.status).toBe('processing');
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('seedance-wavespeed');
      expect(tool.name).toBe('Seedance via WaveSpeed');
    });

    it('declares ai-video capability', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-video');
      expect(cap.isAsync).toBe(true);
      expect(cap.costTier).toBe('cheap');
    });
  });
});

// ── Model variant tests ────────────────────────────────────────

describe('WavespeedTool model variants', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    process.env.WAVESPEED_API_KEY = 'ws-test-key';
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'ws-task-1' } }), { status: 200 })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe('WAN 2.1', () => {
    it('sends correct model slug and includes size field', async () => {
      await wavespeedWanTool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1-t2v-480p');

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.size).toBe('480x832');
      expect(body.num_frames).toBe(80);
    });

    it('has correct id', () => {
      expect(wavespeedWanTool.id).toBe('wan-wavespeed');
    });
  });

  describe('FLUX Schnell', () => {
    it('sends image-specific params', async () => {
      await wavespeedFluxTool.generate(makeRequest({ aspectRatio: '16:9' }));

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.wavespeed.ai/api/v3/black-forest-labs/flux.1-schnell');

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_size).toBe('landscape_16_9');
      expect(body.num_inference_steps).toBe(4);
      expect(body.num_images).toBe(1);
    });

    it('maps 9:16 to portrait_16_9', async () => {
      await wavespeedFluxTool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_size).toBe('portrait_16_9');
    });

    it('maps 1:1 to square', async () => {
      await wavespeedFluxTool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.image_size).toBe('square');
    });

    it('declares ai-image capability', () => {
      expect(wavespeedFluxTool.capabilities[0]!.assetType).toBe('ai-image');
    });
  });

  describe('NanoBanana Pro', () => {
    it('sends resolution and aspect_ratio params', async () => {
      await wavespeedNanaBananaProTool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.wavespeed.ai/api/v3/google/nano-banana-pro/text-to-image');

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.resolution).toBe('1k');
      expect(body.aspect_ratio).toBe('9:16');
      expect(body.output_format).toBe('png');
    });

    it('has prompt guidelines', () => {
      expect(wavespeedNanaBananaProTool.promptGuidelines).toBeDefined();
    });
  });

  describe('WAN 2.6', () => {
    it('uses 24fps for num_frames calculation', async () => {
      await wavespeedWan26Tool.generate(makeRequest({ durationSeconds: 4 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.num_frames).toBe(96); // 4 * 24
    });

    it('maps 16:9 to 1280x720', async () => {
      await wavespeedWan26Tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.size).toBe('1280x720');
    });

    it('maps 9:16 to 720x1280', async () => {
      await wavespeedWan26Tool.generate(makeRequest({ aspectRatio: '9:16' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.size).toBe('720x1280');
    });
  });

  describe('Qwen Image 2.0', () => {
    it('sends aspect_ratio param', async () => {
      await wavespeedQwenImageTool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('1:1');
    });

    it('uses default aspect ratio when not provided', async () => {
      await wavespeedQwenImageTool.generate(makeRequest({ aspectRatio: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('9:16');
    });
  });
});
