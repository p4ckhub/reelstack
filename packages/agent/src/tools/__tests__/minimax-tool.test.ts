import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { MinimaxVideoTool } from '../minimax-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'a golden sunset over mountains',
    durationSeconds: 6,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('MinimaxVideoTool', () => {
  let tool: MinimaxVideoTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new MinimaxVideoTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_MODEL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when MINIMAX_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'MINIMAX_API_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.MINIMAX_API_KEY = 'test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.MINIMAX_API_KEY = 'test-key';
    });

    it('sends correct request body to /video_generation', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ task_id: 'mm-task-1', base_resp: { status_code: 0, status_msg: 'ok' } }),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.minimax.io/v1/video_generation');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.prompt).toBe('a golden sunset over mountains');
      expect(body.model).toBe('video-01-live');
      expect(body.duration).toBe(6);
      expect(body.resolution).toBe('720P');
    });

    it('returns processing with task_id on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ task_id: 'mm-task-1', base_resp: { status_code: 0, status_msg: 'ok' } }),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'mm-task-1',
        toolId: 'minimax',
        status: 'processing',
      });
    });

    it('returns failed when API key not set', async () => {
      delete process.env.MINIMAX_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('MINIMAX_API_KEY not set');
      expect(result.toolId).toBe('minimax');
    });

    it('handles HTTP error response', async () => {
      mockFetch.mockResolvedValue(
        new Response('{"error": "Rate limit exceeded"}', { status: 429 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('MiniMax API error (429)');
    });

    it('handles base_resp error from API', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ base_resp: { status_code: 1001, status_msg: 'Content violation' } }),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content violation');
    });

    it('returns failed when no task_id returned', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ base_resp: { status_code: 0, status_msg: 'ok' } }), {
          status: 200,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No task_id returned');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Connection refused');
    });

    it('uses default prompt when none provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ task_id: 'mm-task-2', base_resp: { status_code: 0, status_msg: 'ok' } }),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('abstract cinematic background');
    });

    it('uses 1080P resolution for 16:9 aspect ratio', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ task_id: 'mm-task-3', base_resp: { status_code: 0, status_msg: 'ok' } }),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.resolution).toBe('1080P');
    });

    it('uses custom model from env var', async () => {
      process.env.MINIMAX_MODEL = 'video-02-pro';
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ task_id: 'mm-task-4', base_resp: { status_code: 0, status_msg: 'ok' } }),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('video-02-pro');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'mm-task-abc-123';

    beforeEach(() => {
      process.env.MINIMAX_API_KEY = 'test-key';
    });

    it('returns completed with URL and calls addCost on Success', async () => {
      // First call: query task status
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'Success', file_id: 'file-xyz' }), { status: 200 })
      );
      // Second call: retrieve file download URL
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ file: { download_url: 'https://cdn.minimax.io/video.mp4' } }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.minimax.io/video.mp4');
      expect(result.durationSeconds).toBe(6);
      expect(result.toolId).toBe('minimax');
      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:minimax');
      expect(costCall?.provider).toBe('minimax');
      expect(costCall?.type).toBe('video');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('sends GET to correct query endpoint with task_id', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'Processing' }), { status: 200 })
      );

      await tool.poll(JOB_ID);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.minimax.io/v1/query/video_generation?task_id=${JOB_ID}`);
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer test-key' })
      );
    });

    it('returns processing on Queueing status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'Queueing' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'minimax', status: 'processing' });
    });

    it('returns processing on Processing status', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'Processing' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result).toEqual({ jobId: JOB_ID, toolId: 'minimax', status: 'processing' });
    });

    it('returns failed on Fail status', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'Fail',
            base_resp: { status_code: 2001, status_msg: 'Content policy violation' },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content policy violation');
    });

    it('returns failed with default message on Fail without status_msg', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'Fail' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('MiniMax generation failed');
    });

    it('returns failed when Success but no file_id', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'Success' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No file_id in MiniMax result');
    });

    it('returns failed when file retrieve HTTP fails', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'Success', file_id: 'file-xyz' }), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('MiniMax file retrieve error (404)');
    });

    it('returns failed when file retrieve has no download_url', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'Success', file_id: 'file-xyz' }), { status: 200 })
      );
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ file: {} }), { status: 200 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No download_url in MiniMax file response');
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

    it('returns failed when API key not set', async () => {
      delete process.env.MINIMAX_API_KEY;

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('MINIMAX_API_KEY not set');
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

    it('rejects jobId exceeding 256 chars', async () => {
      const result = await tool.poll('a'.repeat(257));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('accepts valid jobId with hyphens, dots, tildes', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'Processing' }), { status: 200 })
      );

      const result = await tool.poll('task-123.abc~xyz');

      expect(result.status).toBe('processing');
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('minimax');
      expect(tool.name).toBe('MiniMax Hailuo (direct)');
    });

    it('declares ai-video capability with async polling', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-video');
      expect(cap.isAsync).toBe(true);
      expect(cap.maxDurationSeconds).toBe(6);
      expect(cap.costTier).toBe('moderate');
    });
  });
});
