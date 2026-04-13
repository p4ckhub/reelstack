import { describe, it, expect, vi, beforeEach, afterEach, afterAll, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import fs from 'fs';

// child_process needs vi.mock (tool destructures execSync at import time)
import {
  childProcessMockFactory,
  mockExecSync as sharedMockExecSync,
} from '../../__test-utils__/child-process-mock';
vi.mock('child_process', childProcessMockFactory);

// fs uses spyOn — no vi.mock, no leaking to other test files
import { Veo31GeminiTool } from '../veo31-gemini-tool';

const mockExecSync = sharedMockExecSync;
const mockReadFileSync = vi.spyOn(fs, 'readFileSync');
const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
afterAll(() => {
  mockReadFileSync.mockRestore();
  mockWriteFileSync.mockRestore();
});

const PROJECT_ID = 'my-gcp-project';
const FAKE_TOKEN = 'ya29.fake-access-token';
const BASE_URL = `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/veo-3.1-generate-001`;

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 6,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('Veo31GeminiTool', () => {
  let tool: Veo31GeminiTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new Veo31GeminiTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockExecSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    delete process.env.VERTEX_PROJECT_ID;
    delete process.env.VEO31_MODEL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when VERTEX_PROJECT_ID not set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'VERTEX_PROJECT_ID not set' });
    });

    it('returns unavailable when gcloud auth fails', async () => {
      process.env.VERTEX_PROJECT_ID = PROJECT_ID;
      mockExecSync.mockImplementation(() => {
        throw new Error('gcloud not found');
      });

      const result = await tool.healthCheck();
      expect(result).toEqual({
        available: false,
        reason: 'gcloud auth not configured (run: gcloud auth login)',
      });
    });

    it('returns available when project and auth configured', async () => {
      process.env.VERTEX_PROJECT_ID = PROJECT_ID;
      mockExecSync.mockReturnValue(FAKE_TOKEN);

      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.VERTEX_PROJECT_ID = PROJECT_ID;
      mockExecSync.mockReturnValue(`${FAKE_TOKEN}\n`);
    });

    it('sends correct request to Vertex AI endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ name: 'projects/123/operations/op-abc' }), {
          status: 200,
        })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${BASE_URL}:predictLongRunning`);
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FAKE_TOKEN}`,
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.instances[0].prompt).toBe('aerial view of a neon city at night');
      expect(body.parameters).toEqual({
        aspectRatio: '9:16',
        sampleCount: 1,
        durationSeconds: 6,
        personGeneration: 'allow_all',
        generateAudio: true,
      });
    });

    it('handles text-to-video request', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ name: 'projects/123/operations/op-text2vid' }), {
          status: 200,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('projects/123/operations/op-text2vid');
      expect(result.toolId).toBe('veo31-gemini');
    });

    it('handles image-to-video with local file', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ name: 'projects/123/operations/op-img2vid' }), {
          status: 200,
        })
      );

      const fakeImageBuffer = Buffer.from('fake-png-data');
      mockReadFileSync.mockReturnValue(fakeImageBuffer);

      const result = await tool.generate(makeRequest({ imageUrl: '/tmp/reference-image.png' }));

      expect(mockReadFileSync).toHaveBeenCalled();
      expect(result.status).toBe('processing');

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.instances[0].image).toEqual({
        bytesBase64Encoded: fakeImageBuffer.toString('base64'),
        mimeType: 'image/png',
      });
    });

    it('returns pending job with operation name', async () => {
      const operationName = 'projects/my-gcp-project/locations/us-central1/operations/12345';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ name: operationName }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: operationName,
        toolId: 'veo31-gemini',
        status: 'processing',
      });
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(
        new Response('{"error": {"code": 403, "message": "Permission denied"}}', {
          status: 403,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Veo 3.1 API error (403)');
      expect(result.toolId).toBe('veo31-gemini');
    });

    it('returns failed when auth not configured', async () => {
      delete process.env.VERTEX_PROJECT_ID;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Vertex AI auth not configured');
    });

    it('returns failed when no operation name returned', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No operation name returned');
    });

    it('caps duration at 8 seconds', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'op/1' }), { status: 200 }));

      await tool.generate(makeRequest({ durationSeconds: 30 }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.parameters.durationSeconds).toBe(8);
    });

    it('defaults aspect ratio to 9:16 for non-16:9', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: 'op/1' }), { status: 200 }));

      await tool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.parameters.aspectRatio).toBe('9:16');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const OPERATION_NAME = 'projects/123/locations/us-central1/operations/op-abc';

    beforeEach(() => {
      process.env.VERTEX_PROJECT_ID = PROJECT_ID;
      mockExecSync.mockReturnValue(FAKE_TOKEN);
    });

    it('returns completed with video URL when done (base64 response)', async () => {
      const fakeVideoBase64 = Buffer.from('fake-mp4-data').toString('base64');

      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            response: {
              videos: [{ bytesBase64Encoded: fakeVideoBase64 }],
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(OPERATION_NAME);

      expect(result.status).toBe('completed');
      expect(result.url).toMatch(/veo31-.*\.mp4$/);
      expect(result.durationSeconds).toBe(8);
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const writtenBuffer = mockWriteFileSync.mock.calls[0]![1] as Buffer;
      expect(writtenBuffer.toString()).toBe('fake-mp4-data');
    });

    it('returns completed with URI-based response', async () => {
      const videoUri = 'gs://bucket/video.mp4';

      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: videoUri } }],
              },
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(OPERATION_NAME);

      expect(result.status).toBe('completed');
      expect(result.url).toBe(videoUri);
    });

    it('returns pending when operation still running', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ done: false }), { status: 200 }));

      const result = await tool.poll(OPERATION_NAME);

      expect(result).toEqual({
        jobId: OPERATION_NAME,
        toolId: 'veo31-gemini',
        status: 'processing',
      });
    });

    it('handles error response from completed operation', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            done: true,
            error: { code: 500, message: 'Internal server error' },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(OPERATION_NAME);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Veo 3.1 error: Internal server error');
    });

    it('returns processing when API returns non-ok status', async () => {
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      const result = await tool.poll(OPERATION_NAME);

      expect(result.status).toBe('processing');
    });

    it('returns failed when gcloud auth expired', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('token expired');
      });

      const result = await tool.poll(OPERATION_NAME);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('gcloud auth expired');
    });

    it('rejects invalid operation name formats', async () => {
      const result = await tool.poll('../../../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid operation name format');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.poll(OPERATION_NAME);

      expect(result.status).toBe('processing');
    });

    it('sends correct request to fetchPredictOperation endpoint', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ done: false }), { status: 200 }));

      await tool.poll(OPERATION_NAME);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${BASE_URL}:fetchPredictOperation`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body as string);
      expect(body.operationName).toBe(OPERATION_NAME);
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('veo31-gemini');
      expect(tool.name).toBe('Veo 3.1 (Vertex AI, native audio)');
    });

    it('declares ai-video capability with async polling', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-video');
      expect(cap.isAsync).toBe(true);
      expect(cap.supportsScript).toBe(true);
      expect(cap.costTier).toBe('expensive');
    });
  });
});
