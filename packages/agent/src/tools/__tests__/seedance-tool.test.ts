import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

// isPublicUrl not mocked - real implementation works with test URLs.

import { SeedanceTool } from '../seedance-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('SeedanceTool', () => {
  let tool: SeedanceTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new SeedanceTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.SEEDANCE_API_BASE;
    delete process.env.SEEDANCE_MODEL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('seedance');
      expect(tool.name).toBe('Seedance Video');
    });

    it('declares ai-video capability with async polling', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-video');
      expect(cap.isAsync).toBe(true);
      expect(cap.costTier).toBe('moderate');
      expect(cap.maxDurationSeconds).toBe(10);
    });
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when SEEDANCE_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'SEEDANCE_API_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.SEEDANCE_API_KEY = 'sd-test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.SEEDANCE_API_KEY = 'sd-test-key';
    });

    it('returns failed when API key not set', async () => {
      delete process.env.SEEDANCE_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('SEEDANCE_API_KEY not set');
      expect(result.toolId).toBe('seedance');
    });

    it('sends correct request to Seedance API', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.seedance.ai/v1/videos/text2video');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer sd-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('seedance-1.0');
      expect(body.prompt).toBe('aerial view of a neon city at night');
      expect(body.duration).toBe(5);
      expect(body.aspect_ratio).toBe('9:16');
    });

    it('returns processing with task_id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('task-abc');
      expect(result.toolId).toBe('seedance');
    });

    it('clamps duration to max 10 seconds', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 30 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(10);
    });

    it('defaults duration to 5 when not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(5);
    });

    it('maps 16:9 aspect ratio correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('16:9');
    });

    it('maps 1:1 aspect ratio correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('1:1');
    });

    it('uses default prompt when prompt not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('abstract cinematic background');
    });

    it('returns failed on API error response', async () => {
      mockFetch.mockResolvedValue(new Response('{"error": "rate limited"}', { status: 429 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Seedance API error (429)');
    });

    it('returns failed on 500 server error', async () => {
      mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Seedance API error (500)');
    });

    it('returns failed when no task_id in response', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No task_id returned');
    });

    it('returns message from API when no task_id', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Insufficient credits' }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Insufficient credits');
    });

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Connection refused');
    });

    it('respects SEEDANCE_MODEL env override', async () => {
      process.env.SEEDANCE_MODEL = 'seedance-2.0';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('seedance-2.0');
    });

    it('respects SEEDANCE_API_BASE env override for public URLs', async () => {
      process.env.SEEDANCE_API_BASE = 'https://proxy.example.com';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://proxy.example.com/v1/videos/text2video');
    });

    it('does not call addCost on generate (async tool)', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'task-abc' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockAddCost).not.toHaveBeenCalled();
    });
  });

  // ── poll ───────────────────────────────────────────────────────

  describe('poll', () => {
    beforeEach(() => {
      process.env.SEEDANCE_API_KEY = 'sd-test-key';
    });

    it('returns failed when API key not set', async () => {
      delete process.env.SEEDANCE_API_KEY;

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('SEEDANCE_API_KEY not set');
    });

    it('returns failed for empty jobId', async () => {
      const result = await tool.poll('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed for jobId exceeding 256 chars', async () => {
      const result = await tool.poll('a'.repeat(257));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed for jobId with special characters', async () => {
      const result = await tool.poll('task/../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('sends correct poll request', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_status: 'processing' } }), { status: 200 })
      );

      await tool.poll('task-abc');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.seedance.ai/v1/videos/text2video/task-abc');
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer sd-test-key' })
      );
    });

    it('returns completed with URL when task succeeds', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              task_status: 'succeed',
              task_result: { videos: [{ url: 'https://cdn.seedance.ai/video.mp4', duration: 5 }] },
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.seedance.ai/video.mp4');
      expect(result.durationSeconds).toBe(5);
    });

    it('also accepts "completed" task_status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              task_status: 'completed',
              task_result: { videos: [{ url: 'https://cdn.seedance.ai/video.mp4' }] },
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.seedance.ai/video.mp4');
    });

    it('calls addCost on successful poll', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              task_status: 'succeed',
              task_result: { videos: [{ url: 'https://cdn.seedance.ai/video.mp4' }] },
            },
          }),
          { status: 200 }
        )
      );

      await tool.poll('task-abc');

      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:seedance');
      expect(costCall?.provider).toBe('seedance');
      expect(costCall?.model).toBe('seedance');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('returns failed when succeed but no video URL', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { task_status: 'succeed', task_result: { videos: [] } },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No video URL in result');
    });

    it('returns failed with error message when task fails', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { task_status: 'failed', error_msg: 'Content policy violation' },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content policy violation');
    });

    it('returns default error message when task fails without error_msg', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_status: 'failed' } }), { status: 200 })
      );

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Seedance generation failed');
    });

    it('returns processing when task is still in progress', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_status: 'processing' } }), { status: 200 })
      );

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('processing');
    });

    it('returns processing when API returns non-OK status', async () => {
      mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('processing');
    });

    it('returns processing when data is missing from response', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error (does not throw)', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.poll('task-abc');

      expect(result.status).toBe('processing');
    });

    it('does not call addCost when task is still processing', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_status: 'processing' } }), { status: 200 })
      );

      await tool.poll('task-abc');

      expect(mockAddCost).not.toHaveBeenCalled();
    });
  });
});
