import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { Veo3Tool } from '../veo3-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('Veo3Tool', () => {
  let tool: Veo3Tool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new Veo3Tool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.VEO3_API_KEY;
    delete process.env.VEO3_PROJECT_ID;
    delete process.env.VEO3_LOCATION;
    delete process.env.VEO3_MODEL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when VEO3_API_KEY not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'VEO3_API_KEY not set' });
    });

    it('returns unavailable when VEO3_PROJECT_ID not set', async () => {
      process.env.VEO3_API_KEY = 'test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'VEO3_PROJECT_ID not set' });
    });

    it('returns available when both API key and project ID set', async () => {
      process.env.VEO3_API_KEY = 'test-key';
      process.env.VEO3_PROJECT_ID = 'test-project';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.VEO3_API_KEY = 'test-key';
      process.env.VEO3_PROJECT_ID = 'test-project';
    });

    it('returns failed when not configured', async () => {
      delete process.env.VEO3_API_KEY;
      const result = await tool.generate(makeRequest());
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Veo3 not configured');
    });

    it('sends correct request to Vertex AI predictLongRunning endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ name: 'operations/op-123' }), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toContain('aiplatform.googleapis.com');
      expect(url).toContain(':predictLongRunning');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.instances[0].prompt).toBe('aerial view of a neon city at night');
      expect(body.parameters.aspectRatio).toBe('9:16');
      expect(body.parameters.durationSeconds).toBe(5);
      expect(body.parameters.generateAudio).toBe(false);
    });

    it('returns processing with operation name on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ name: 'operations/op-123' }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('operations/op-123');
      expect(result.toolId).toBe('veo3');
    });

    it('returns failed on API error', async () => {
      mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Veo3 API error (401)');
    });

    it('returns failed when no operation name returned', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No operation name returned');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Connection refused');
    });

    it('caps duration to 8 seconds', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'op-1' }), { status: 200 }));

      await tool.generate(makeRequest({ durationSeconds: 15 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.parameters.durationSeconds).toBe(8);
    });

    it('uses default prompt when none provided', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'op-1' }), { status: 200 }));

      await tool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.instances[0].prompt).toBe('abstract cinematic background');
    });

    it('uses 16:9 aspect ratio when specified', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'op-1' }), { status: 200 }));

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.parameters.aspectRatio).toBe('16:9');
    });

    it('uses custom location from env', async () => {
      process.env.VEO3_LOCATION = 'eu-west1';
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'op-1' }), { status: 200 }));

      await tool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('eu-west1-aiplatform.googleapis.com');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'projects/test/locations/us-central1/operations/op-123';

    beforeEach(() => {
      process.env.VEO3_API_KEY = 'test-key';
      process.env.VEO3_PROJECT_ID = 'test-project';
    });

    it('returns completed with video URL and tracks cost', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: 'https://storage.googleapis.com/video.mp4' } }],
              },
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://storage.googleapis.com/video.mp4');
      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:veo3',
          provider: 'veo3',
          type: 'video',
        })
      );
    });

    it('returns processing when operation not done', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ done: false }), { status: 200 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns failed on error in response', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            error: { code: 400, message: 'Content policy violation' },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Content policy violation');
    });

    it('returns failed when done but no video in response', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ done: true, response: {} }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No video in response');
    });

    it('returns processing on non-ok HTTP status', async () => {
      mockFetch.mockResolvedValue(new Response('Error', { status: 503 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.VEO3_API_KEY;

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('VEO3_API_KEY not set');
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
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('veo3');
      expect(tool.name).toBe('Google Veo 3');
    });

    it('declares ai-video capability', () => {
      expect(tool.capabilities).toHaveLength(1);
      expect(tool.capabilities[0].assetType).toBe('ai-video');
    });

    it('capability is async with moderate cost', () => {
      expect(tool.capabilities[0].isAsync).toBe(true);
      expect(tool.capabilities[0].costTier).toBe('moderate');
    });

    it('max duration is 8 seconds', () => {
      expect(tool.capabilities[0].maxDurationSeconds).toBe(8);
    });
  });
});
