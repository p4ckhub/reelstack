import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { RunwayTool } from '../runway-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('RunwayTool', () => {
  let tool: RunwayTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new RunwayTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.RUNWAY_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when RUNWAY_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'RUNWAY_API_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.RUNWAY_API_KEY = 'rk-test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.RUNWAY_API_KEY = 'rk-test-key';
    });

    it('sends correct request body to /text_to_video', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'task-abc-123' }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.runwayml.com/v1/text_to_video');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer rk-test-key',
          'X-Runway-Version': '2024-11-06',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.promptText).toBe('aerial view of a neon city at night');
      expect(body.model).toBe('gen4_turbo');
      expect(body.duration).toBe(5);
      expect(body.ratio).toBe('768:1280');
    });

    it('returns processing with task id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'task-abc-123' }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'task-abc-123',
        toolId: 'runway',
        status: 'processing',
      });
    });

    it('returns failed when API key not set', async () => {
      delete process.env.RUNWAY_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('RUNWAY_API_KEY not set');
      expect(result.toolId).toBe('runway');
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(
        new Response('{"error": "Rate limit exceeded"}', { status: 429 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Runway API error (429)');
    });

    it('returns failed when no task id returned', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No task id returned');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Network timeout');
    });

    it('maps 16:9 aspect ratio to 1280:768', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }));

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.ratio).toBe('1280:768');
    });

    it('maps 1:1 aspect ratio to 1024:1024', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }));

      await tool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.ratio).toBe('1024:1024');
    });

    it('rounds duration to nearest 5 and clamps to [5, 10]', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }));

      // 3 rounds to 5, clamped to 5
      await tool.generate(makeRequest({ durationSeconds: 3 }));
      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(5);

      mockFetch.mockClear();

      // 8 rounds to 10
      await tool.generate(makeRequest({ durationSeconds: 8 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(10);

      mockFetch.mockClear();

      // 30 rounds to 30, clamped to 10
      await tool.generate(makeRequest({ durationSeconds: 30 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.duration).toBe(10);
    });

    it('uses default prompt when none provided', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }));

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.promptText).toBe('abstract cinematic background');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'task-abc-123';

    beforeEach(() => {
      process.env.RUNWAY_API_KEY = 'rk-test-key';
    });

    it('returns completed with URL and calls addCost on SUCCEEDED', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: JOB_ID,
            status: 'SUCCEEDED',
            output: ['https://cdn.runway.com/video.mp4'],
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.runway.com/video.mp4');
      expect(result.toolId).toBe('runway');
      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:runway');
      expect(costCall?.provider).toBe('runway');
      expect(costCall?.model).toBe('gen4_turbo');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('returns failed on FAILED status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: JOB_ID,
            status: 'FAILED',
            failure: 'Content moderation triggered',
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content moderation triggered');
    });

    it('returns failed on CANCELLED status with default message', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'CANCELLED' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Runway generation failed');
    });

    it('returns processing when still running', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'PENDING' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'runway', status: 'processing' });
    });

    it('returns processing on non-ok HTTP status', async () => {
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('rejects invalid jobId format', async () => {
      const result = await tool.poll('../../../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects empty jobId', async () => {
      const result = await tool.poll('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('rejects jobId exceeding 256 chars', async () => {
      const result = await tool.poll('a'.repeat(257));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed when SUCCEEDED but no output URL', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'SUCCEEDED', output: [] }), {
          status: 200,
        })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No video URL in Runway result');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.RUNWAY_API_KEY;

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('RUNWAY_API_KEY not set');
    });

    it('sends GET request to correct endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: JOB_ID, status: 'PENDING' }), { status: 200 })
      );

      await tool.poll(JOB_ID);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.runwayml.com/v1/tasks/${JOB_ID}`);
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer rk-test-key',
          'X-Runway-Version': '2024-11-06',
        })
      );
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('runway');
      expect(tool.name).toBe('Runway Gen-4');
    });

    it('declares ai-video capability with async polling', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-video');
      expect(cap.isAsync).toBe(true);
      expect(cap.costTier).toBe('expensive');
    });
  });
});
