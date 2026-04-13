import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { KlingTool } from '../kling-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('KlingTool', () => {
  let tool: KlingTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new KlingTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.KLING_API_KEY;
    delete process.env.KLING_MODEL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('kling');
      expect(tool.name).toBe('Kling AI Video');
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
    it('returns unavailable when KLING_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'KLING_API_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.KLING_API_KEY = 'kling-test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.KLING_API_KEY = 'kling-test-key';
    });

    it('returns failed when API key not set', async () => {
      delete process.env.KLING_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('KLING_API_KEY not set');
      expect(result.toolId).toBe('kling');
    });

    it('sends correct request to Kling API', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.klingai.com/v1/videos/text2video');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer kling-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.model_name).toBe('kling-v2.1-master');
      expect(body.prompt).toBe('aerial view of a neon city at night');
      expect(body.duration).toBe('5');
      expect(body.aspect_ratio).toBe('9:16');
      expect(body.mode).toBe('std');
    });

    it('sends duration as string (not number)', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 8 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe('8');
      expect(typeof body.duration).toBe('string');
    });

    it('returns processing with task_id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('kling-task-1');
      expect(result.toolId).toBe('kling');
    });

    it('clamps duration to max 10 seconds', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: 60 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe('10');
    });

    it('defaults duration to 5 when not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ durationSeconds: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe('5');
    });

    it('maps 16:9 aspect ratio correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('16:9');
    });

    it('maps 1:1 aspect ratio correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.aspect_ratio).toBe('1:1');
    });

    it('uses default prompt when prompt not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('abstract cinematic background');
    });

    it('returns failed on 429 rate limit', async () => {
      mockFetch.mockResolvedValue(new Response('{"error": "rate limited"}', { status: 429 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Kling API error (429)');
    });

    it('returns failed on 500 server error', async () => {
      mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Kling API error (500)');
    });

    it('returns failed when no task_id in response', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No task_id returned');
    });

    it('returns message from API when no task_id', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Quota exceeded', code: 1001 }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Quota exceeded');
    });

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('ETIMEDOUT');
    });

    it('respects KLING_MODEL env override', async () => {
      process.env.KLING_MODEL = 'kling-v3-master';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model_name).toBe('kling-v3-master');
    });

    it('does not call addCost on generate (async tool)', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockAddCost).not.toHaveBeenCalled();
    });
  });

  // ── poll ───────────────────────────────────────────────────────

  describe('poll', () => {
    beforeEach(() => {
      process.env.KLING_API_KEY = 'kling-test-key';
    });

    it('returns failed when API key not set', async () => {
      delete process.env.KLING_API_KEY;

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('KLING_API_KEY not set');
    });

    it('returns failed for empty jobId', async () => {
      const result = await tool.poll('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed for jobId exceeding 256 chars', async () => {
      const result = await tool.poll('x'.repeat(257));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed for jobId with path traversal characters', async () => {
      const result = await tool.poll('task/../../../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('sends correct poll request', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ data: { task_id: 'kling-task-1', task_status: 'processing' } }),
          { status: 200 }
        )
      );

      await tool.poll('kling-task-1');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.klingai.com/v1/videos/text2video/kling-task-1');
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer kling-test-key' })
      );
    });

    it('returns completed with URL and duration when task succeeds', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              task_id: 'kling-task-1',
              task_status: 'succeed',
              task_result: { videos: [{ url: 'https://cdn.klingai.com/video.mp4', duration: 5 }] },
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.klingai.com/video.mp4');
      expect(result.durationSeconds).toBe(5);
    });

    it('calls addCost on successful poll', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              task_id: 'kling-task-1',
              task_status: 'succeed',
              task_result: { videos: [{ url: 'https://cdn.klingai.com/video.mp4' }] },
            },
          }),
          { status: 200 }
        )
      );

      await tool.poll('kling-task-1');

      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:kling');
      expect(costCall?.provider).toBe('kling');
      expect(costCall?.model).toBe('kling-3.0');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('returns failed when succeed but no video URL', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { task_id: 'kling-task-1', task_status: 'succeed', task_result: { videos: [] } },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No video URL in result');
    });

    it('returns failed with status message when task fails', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              task_id: 'kling-task-1',
              task_status: 'failed',
              task_status_msg: 'Content violation',
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content violation');
    });

    it('returns default error message when task fails without task_status_msg', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'kling-task-1', task_status: 'failed' } }), {
          status: 200,
        })
      );

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Kling generation failed');
    });

    it('returns processing for submitted status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ data: { task_id: 'kling-task-1', task_status: 'submitted' } }),
          { status: 200 }
        )
      );

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('processing');
    });

    it('returns processing for processing status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ data: { task_id: 'kling-task-1', task_status: 'processing' } }),
          { status: 200 }
        )
      );

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('processing');
    });

    it('returns processing when API returns non-OK status', async () => {
      mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('processing');
    });

    it('returns processing when data is missing from response', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error (does not throw)', async () => {
      mockFetch.mockRejectedValue(new Error('Socket hang up'));

      const result = await tool.poll('kling-task-1');

      expect(result.status).toBe('processing');
    });

    it('does not call addCost when task is still processing', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ data: { task_id: 'kling-task-1', task_status: 'processing' } }),
          { status: 200 }
        )
      );

      await tool.poll('kling-task-1');

      expect(mockAddCost).not.toHaveBeenCalled();
    });
  });
});
