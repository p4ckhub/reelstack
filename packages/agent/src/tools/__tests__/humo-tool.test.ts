import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { HumoTool } from '../humo-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'Talking avatar intro',
    prompt: 'natural studio lighting, soft bokeh background',
    script: 'Hello, welcome to the tutorial.',
    avatarId: 'https://cdn.example.com/portrait.jpg',
    durationSeconds: 4,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('HumoTool', () => {
  let tool: HumoTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new HumoTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.RUNPOD_API_KEY;
    delete process.env.HUMO_RUNPOD_ENDPOINT_ID;
    delete process.env.HUMO_DEFAULT_IMAGE_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when RUNPOD_API_KEY not set', async () => {
      process.env.HUMO_RUNPOD_ENDPOINT_ID = 'ep-123';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'RUNPOD_API_KEY not set' });
    });

    it('returns unavailable when HUMO_RUNPOD_ENDPOINT_ID not set', async () => {
      process.env.RUNPOD_API_KEY = 'rp-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'HUMO_RUNPOD_ENDPOINT_ID not set' });
    });

    it('returns available when both env vars are set', async () => {
      process.env.RUNPOD_API_KEY = 'rp-key';
      process.env.HUMO_RUNPOD_ENDPOINT_ID = 'ep-123';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.RUNPOD_API_KEY = 'rp-key';
      process.env.HUMO_RUNPOD_ENDPOINT_ID = 'ep-123';
    });

    it('sends correct request body to RunPod endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'rp-job-1', status: 'IN_QUEUE' }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.runpod.ai/v2/ep-123/run');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer rp-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.input.image_url).toBe('https://cdn.example.com/portrait.jpg');
      expect(body.input.script).toBe('Hello, welcome to the tutorial.');
      expect(body.input.prompt).toBe('natural studio lighting, soft bokeh background');
      expect(body.input.resolution).toBe('480');
    });

    it('returns processing with job id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'rp-job-1', status: 'IN_QUEUE' }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'rp-job-1',
        toolId: 'humo',
        status: 'processing',
      });
    });

    it('returns failed when env vars not set', async () => {
      delete process.env.RUNPOD_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('RUNPOD_API_KEY or HUMO_RUNPOD_ENDPOINT_ID not set');
    });

    it('returns failed when no image URL available', async () => {
      const result = await tool.generate(makeRequest({ avatarId: undefined }));

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No image URL');
    });

    it('uses HUMO_DEFAULT_IMAGE_URL as fallback when no avatarId', async () => {
      process.env.HUMO_DEFAULT_IMAGE_URL = 'https://cdn.example.com/default-portrait.jpg';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'rp-job-2' }), { status: 200 })
      );

      await tool.generate(makeRequest({ avatarId: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.image_url).toBe('https://cdn.example.com/default-portrait.jpg');
    });

    it('returns failed when neither script nor prompt provided', async () => {
      const result = await tool.generate(makeRequest({ script: undefined, prompt: undefined }));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('script or prompt is required');
    });

    it('uses prompt as script fallback when script is missing', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'rp-job-3' }), { status: 200 })
      );

      await tool.generate(makeRequest({ script: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.script).toBe('natural studio lighting, soft bokeh background');
    });

    it('uses default prompt when prompt is missing', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'rp-job-4' }), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.prompt).toBe('natural lighting, engaging presentation');
    });

    it('handles HTTP error response', async () => {
      mockFetch.mockResolvedValue(new Response('{"error": "Endpoint not found"}', { status: 404 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('RunPod API error (404)');
    });

    it('returns failed when no job id in response', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'OK' }), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No job ID returned from RunPod');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'rp-job-abc-123';

    beforeEach(() => {
      process.env.RUNPOD_API_KEY = 'rp-key';
      process.env.HUMO_RUNPOD_ENDPOINT_ID = 'ep-123';
    });

    it('returns completed with URL and calls addCost on COMPLETED', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: JOB_ID,
            status: 'COMPLETED',
            output: { video_url: 'https://r2.example.com/humo-video.mp4', duration_seconds: 3.8 },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://r2.example.com/humo-video.mp4');
      expect(result.durationSeconds).toBe(3.8);
      expect(result.toolId).toBe('humo');
      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:humo');
      expect(costCall?.provider).toBe('humo');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('sends GET to correct RunPod status endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'IN_QUEUE' }), { status: 200 })
      );

      await tool.poll(JOB_ID);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.runpod.ai/v2/ep-123/status/${JOB_ID}`);
      expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer rp-key' }));
    });

    it('returns processing on IN_QUEUE status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'IN_QUEUE' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'humo', status: 'processing' });
    });

    it('returns processing on IN_PROGRESS status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'IN_PROGRESS' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'humo', status: 'processing' });
    });

    it('returns failed on FAILED status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: JOB_ID,
            status: 'FAILED',
            output: { error: 'OOM: out of memory' },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('OOM: out of memory');
    });

    it('returns failed on CANCELLED status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'CANCELLED' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('HuMo job failed on RunPod');
    });

    it('uses top-level error when output.error is missing', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'FAILED', error: 'Worker crashed' }), {
          status: 200,
        })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Worker crashed');
    });

    it('returns failed when COMPLETED but no video_url', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'COMPLETED', output: {} }), {
          status: 200,
        })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('COMPLETED but no video_url in output');
    });

    it('returns processing on non-ok HTTP status', async () => {
      mockFetch.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Socket hang up'));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns failed when env vars not set', async () => {
      delete process.env.RUNPOD_API_KEY;

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('RUNPOD_API_KEY or HUMO_RUNPOD_ENDPOINT_ID not set');
    });

    // ── jobId validation ─────────────────────────────────────

    it('rejects path traversal in jobId', async () => {
      const result = await tool.poll('../../../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects empty jobId', async () => {
      const result = await tool.poll('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects jobId exceeding 128 chars', async () => {
      const result = await tool.poll('a'.repeat(129));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects jobId with special characters', async () => {
      const result = await tool.poll('job_id.with~tilde');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('accepts valid jobId with alphanumeric and hyphens', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'abc-123', status: 'IN_QUEUE' }), { status: 200 })
      );

      const result = await tool.poll('abc-123');

      expect(result.status).toBe('processing');
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('humo');
      expect(tool.name).toBe('HuMo 1.7B (self-hosted RunPod)');
    });

    it('declares avatar-video capability with async polling', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('avatar-video');
      expect(cap.isAsync).toBe(true);
      expect(cap.maxDurationSeconds).toBe(4);
      expect(cap.costTier).toBe('cheap');
    });

    it('has prompt guidelines', () => {
      expect(tool.promptGuidelines).toBeDefined();
      expect(tool.promptGuidelines).toContain('HuMo');
    });
  });
});
