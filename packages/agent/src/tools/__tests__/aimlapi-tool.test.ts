import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import {
  aimlapiKlingTool,
  aimlapiFluxTool,
  aimlapiKlingV3Tool,
  aimlapiVeo3Tool,
  aimlapiSora2Tool,
  aimlapiPixverseTool,
} from '../aimlapi-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('AIML API Tools', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    delete process.env.AIMLAPI_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── AimlapiKlingTool ─────────────────────────────────────────

  describe('AimlapiKlingTool', () => {
    describe('static properties', () => {
      it('has correct id and name', () => {
        expect(aimlapiKlingTool.id).toBe('kling-aimlapi');
        expect(aimlapiKlingTool.name).toBe('Kling via AIML API');
      });

      it('declares ai-video capability with async polling', () => {
        expect(aimlapiKlingTool.capabilities).toHaveLength(1);
        const cap = aimlapiKlingTool.capabilities[0]!;
        expect(cap.assetType).toBe('ai-video');
        expect(cap.isAsync).toBe(true);
        expect(cap.costTier).toBe('moderate');
      });
    });

    describe('healthCheck', () => {
      it('returns unavailable when AIMLAPI_KEY not set', async () => {
        const result = await aimlapiKlingTool.healthCheck();
        expect(result).toEqual({ available: false, reason: 'AIMLAPI_KEY not set' });
      });

      it('returns available when API key is set', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        const result = await aimlapiKlingTool.healthCheck();
        expect(result).toEqual({ available: true });
      });
    });

    describe('generate', () => {
      beforeEach(() => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
      });

      it('returns failed when API key not set', async () => {
        delete process.env.AIMLAPI_KEY;

        const result = await aimlapiKlingTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('AIMLAPI_KEY not set');
      });

      it('sends correct request to AIML API Kling endpoint', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'gen-abc' }), { status: 200 })
        );

        await aimlapiKlingTool.generate(makeRequest());

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.aimlapi.com/v2/generate/video/kling/generation');
        expect(options.method).toBe('POST');
        expect(options.headers).toEqual(
          expect.objectContaining({
            Authorization: 'Bearer aiml-test-key',
          })
        );

        const body = JSON.parse(options.body as string);
        expect(body.model).toBe('kling-video-v1.6-pro');
        expect(body.prompt).toBe('aerial view of a neon city at night');
        expect(body.duration).toBe('5');
        expect(body.mode).toBe('std');
      });

      it('clamps duration between 5 and 10', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'gen-abc' }), { status: 200 })
        );

        await aimlapiKlingTool.generate(makeRequest({ durationSeconds: 2 }));
        let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.duration).toBe('5');

        mockFetch.mockClear();
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'gen-abc' }), { status: 200 })
        );

        await aimlapiKlingTool.generate(makeRequest({ durationSeconds: 20 }));
        body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.duration).toBe('10');
      });

      it('returns processing with generation id on success', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'gen-abc' }), { status: 200 })
        );

        const result = await aimlapiKlingTool.generate(makeRequest());

        expect(result.status).toBe('processing');
        expect(result.jobId).toBe('gen-abc');
        expect(result.toolId).toBe('kling-aimlapi');
      });

      it('returns failed when no id in response', async () => {
        mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

        const result = await aimlapiKlingTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No job ID returned');
      });

      it('returns failed on API error', async () => {
        mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

        const result = await aimlapiKlingTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('aimlapi API error (403)');
      });

      it('handles network error gracefully', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await aimlapiKlingTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toContain('ECONNREFUSED');
      });
    });

    describe('poll', () => {
      beforeEach(() => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
      });

      it('returns failed when API key not set', async () => {
        delete process.env.AIMLAPI_KEY;

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('AIMLAPI_KEY not set');
      });

      it('returns failed for invalid jobId', async () => {
        const result = await aimlapiKlingTool.poll!('');
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Invalid jobId format');
      });

      it('returns processing for jobId with path traversal (ProviderTool allows slashes)', async () => {
        mockFetch.mockRejectedValue(new Error('should not reach'));
        const result = await aimlapiKlingTool.poll!('id/../../../etc');
        // ProviderTool regex allows / in jobIds — fetch will fail, returning processing
        expect(result.status).toBe('processing');
      });

      it('sends correct poll request with generation_id query param', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'processing' }), { status: 200 })
        );

        await aimlapiKlingTool.poll!('gen-abc');

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toContain('https://api.aimlapi.com/v2/generate/video/kling/generation');
        expect(url).toContain('generation_id=gen-abc');
        expect(options.headers).toEqual(
          expect.objectContaining({ Authorization: 'Bearer aiml-test-key' })
        );
      });

      it('returns completed with video URL on success', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 'completed',
              video: { url: 'https://cdn.aimlapi.com/video.mp4' },
            }),
            { status: 200 }
          )
        );

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('completed');
        expect(result.url).toBe('https://cdn.aimlapi.com/video.mp4');
      });

      it('calls addCost on successful poll', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 'completed',
              video: { url: 'https://cdn.aimlapi.com/video.mp4' },
            }),
            { status: 200 }
          )
        );

        await aimlapiKlingTool.poll!('gen-abc');

        expect(mockAddCost).toHaveBeenCalledOnce();
        expect(mockAddCost).toHaveBeenCalledWith(
          expect.objectContaining({
            step: 'asset:kling-aimlapi',
            provider: 'aimlapi',
            model: 'kling-aimlapi',
            type: 'video',
          })
        );
      });

      it('returns failed when completed but no video URL', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'completed', video: {} }), { status: 200 })
        );

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No URL in result');
      });

      it('returns failed when status is failed', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'failed' }), { status: 200 })
        );

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('aimlapi generation failed');
      });

      it('returns processing for in-progress status', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'processing' }), { status: 200 })
        );

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('processing');
      });

      it('returns processing when API returns non-OK status', async () => {
        mockFetch.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('processing');
      });

      it('returns processing on network error', async () => {
        mockFetch.mockRejectedValue(new Error('Timeout'));

        const result = await aimlapiKlingTool.poll!('gen-abc');

        expect(result.status).toBe('processing');
      });

      it('does not call addCost when still processing', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'processing' }), { status: 200 })
        );

        await aimlapiKlingTool.poll!('gen-abc');

        expect(mockAddCost).not.toHaveBeenCalled();
      });
    });
  });

  // ── AimlapiFluxTool (synchronous image) ──────────────────────

  describe('AimlapiFluxTool', () => {
    describe('static properties', () => {
      it('has correct id and name', () => {
        expect(aimlapiFluxTool.id).toBe('flux-aimlapi');
        expect(aimlapiFluxTool.name).toBe('FLUX via AIML API');
      });

      it('declares ai-image capability with sync (isAsync=false)', () => {
        const cap = aimlapiFluxTool.capabilities[0]!;
        expect(cap.assetType).toBe('ai-image');
        expect(cap.isAsync).toBe(false);
        expect(cap.costTier).toBe('cheap');
      });
    });

    describe('healthCheck', () => {
      it('returns unavailable when AIMLAPI_KEY not set', async () => {
        const result = await aimlapiFluxTool.healthCheck();
        expect(result).toEqual({ available: false, reason: 'AIMLAPI_KEY not set' });
      });

      it('returns available when API key is set', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        const result = await aimlapiFluxTool.healthCheck();
        expect(result).toEqual({ available: true });
      });
    });

    describe('generate', () => {
      beforeEach(() => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
      });

      it('returns failed when API key not set', async () => {
        delete process.env.AIMLAPI_KEY;

        const result = await aimlapiFluxTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('AIMLAPI_KEY not set');
      });

      it('sends correct request to FLUX endpoint', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.aimlapi.com/img.webp' }] }), {
            status: 200,
          })
        );

        await aimlapiFluxTool.generate(makeRequest({ aspectRatio: '9:16' }));

        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.aimlapi.com/v1/images/generations');

        const body = JSON.parse(options.body as string);
        expect(body.model).toBe('flux/schnell');
        expect(body.image_size).toBe('portrait_16_9');
        expect(body.num_inference_steps).toBe(4);
      });

      it('maps 16:9 aspect ratio to landscape_16_9', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.aimlapi.com/img.webp' }] }), {
            status: 200,
          })
        );

        await aimlapiFluxTool.generate(makeRequest({ aspectRatio: '16:9' }));

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.image_size).toBe('landscape_16_9');
      });

      it('maps 1:1 aspect ratio to square', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.aimlapi.com/img.webp' }] }), {
            status: 200,
          })
        );

        await aimlapiFluxTool.generate(makeRequest({ aspectRatio: '1:1' }));

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.image_size).toBe('square');
      });

      it('returns completed with image URL on success', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.aimlapi.com/img.webp' }] }), {
            status: 200,
          })
        );

        const result = await aimlapiFluxTool.generate(makeRequest());

        expect(result.status).toBe('completed');
        expect(result.url).toBe('https://cdn.aimlapi.com/img.webp');
        expect(result.toolId).toBe('flux-aimlapi');
      });

      it('calls addCost on success (synchronous tool)', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.aimlapi.com/img.webp' }] }), {
            status: 200,
          })
        );

        await aimlapiFluxTool.generate(makeRequest());

        expect(mockAddCost).toHaveBeenCalledOnce();
        expect(mockAddCost).toHaveBeenCalledWith(
          expect.objectContaining({
            step: 'asset:flux-aimlapi',
            provider: 'aimlapi',
            model: 'flux',
            type: 'image',
          })
        );
      });

      it('returns failed when no image URL in response', async () => {
        mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

        const result = await aimlapiFluxTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No URL in synchronous response');
      });

      it('returns failed when data array is missing', async () => {
        mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

        const result = await aimlapiFluxTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No URL in synchronous response');
      });

      it('returns failed on API error', async () => {
        mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

        const result = await aimlapiFluxTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('aimlapi API error (401)');
      });

      it('handles network error gracefully', async () => {
        mockFetch.mockRejectedValue(new Error('fetch failed'));

        const result = await aimlapiFluxTool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toContain('fetch failed');
      });

      it('uses default prompt when prompt not provided', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.aimlapi.com/img.webp' }] }), {
            status: 200,
          })
        );

        await aimlapiFluxTool.generate(makeRequest({ prompt: undefined }));

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.prompt).toBe('abstract background');
      });
    });
  });

  // ── AimlapiVideoTool (generic: Veo3, Sora2, KlingV3, Pixverse) ──

  describe('AimlapiVideoTool (generic instances)', () => {
    describe('aimlapiVeo3Tool', () => {
      it('has correct id, name, and provider endpoint', () => {
        expect(aimlapiVeo3Tool.id).toBe('veo3-aimlapi');
        expect(aimlapiVeo3Tool.name).toBe('Veo 3 via AIML API');
      });

      it('declares expensive cost tier', () => {
        expect(aimlapiVeo3Tool.capabilities[0]!.costTier).toBe('expensive');
      });

      it('generates with correct model and endpoint', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'veo-gen-1' }), { status: 200 })
        );

        const result = await aimlapiVeo3Tool.generate(makeRequest());

        expect(result.status).toBe('processing');
        expect(result.jobId).toBe('veo-gen-1');

        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.aimlapi.com/v2/generate/video/google/generation');

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.model).toBe('google/veo3');
        expect(body.aspect_ratio).toBe('9:16');
      });
    });

    describe('aimlapiSora2Tool', () => {
      it('has correct id and name', () => {
        expect(aimlapiSora2Tool.id).toBe('sora2-aimlapi');
        expect(aimlapiSora2Tool.name).toBe('Sora 2 via AIML API');
      });

      it('generates with correct model and endpoint', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'sora-gen-1' }), { status: 200 })
        );

        await aimlapiSora2Tool.generate(makeRequest());

        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.aimlapi.com/v2/generate/video/openai/generation');

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.model).toBe('sora-2-t2v');
        expect(body.duration).toBe(5);
      });
    });

    describe('aimlapiKlingV3Tool', () => {
      it('has correct id and name', () => {
        expect(aimlapiKlingV3Tool.id).toBe('kling-v3-aimlapi');
        expect(aimlapiKlingV3Tool.name).toBe('Kling v3 Pro via AIML API');
      });

      it('generates with pro mode', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'kv3-gen-1' }), { status: 200 })
        );

        await aimlapiKlingV3Tool.generate(makeRequest());

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.model).toBe('klingai/video-v3-pro-text-to-video');
        expect(body.mode).toBe('pro');
      });
    });

    describe('aimlapiPixverseTool', () => {
      it('has correct id and name', () => {
        expect(aimlapiPixverseTool.id).toBe('pixverse-aimlapi');
        expect(aimlapiPixverseTool.name).toBe('Pixverse v5.5 via AIML API');
      });

      it('generates with correct model', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ id: 'pix-gen-1' }), { status: 200 })
        );

        await aimlapiPixverseTool.generate(makeRequest());

        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.aimlapi.com/v2/generate/video/pixverse/generation');

        const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
        expect(body.model).toBe('pixverse/v5-5-text-to-video');
      });
    });

    // Shared poll behavior for all generic video tools
    describe('shared poll behavior (via aimlapiVeo3Tool)', () => {
      beforeEach(() => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
      });

      it('returns failed when API key not set', async () => {
        delete process.env.AIMLAPI_KEY;

        const result = await aimlapiVeo3Tool.poll!('gen-123');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('AIMLAPI_KEY not set');
      });

      it('returns failed for invalid jobId', async () => {
        const result = await aimlapiVeo3Tool.poll!('');
        expect(result.status).toBe('failed');
      });

      it('polls the correct provider endpoint', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'processing' }), { status: 200 })
        );

        await aimlapiVeo3Tool.poll!('gen-123');

        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toContain('https://api.aimlapi.com/v2/generate/video/google/generation');
        expect(url).toContain('generation_id=gen-123');
      });

      it('returns completed with URL on success', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 'completed',
              video: { url: 'https://cdn.example.com/video.mp4' },
            }),
            { status: 200 }
          )
        );

        const result = await aimlapiVeo3Tool.poll!('gen-123');

        expect(result.status).toBe('completed');
        expect(result.url).toBe('https://cdn.example.com/video.mp4');
      });

      it('calls addCost on successful poll', async () => {
        mockFetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              status: 'completed',
              video: { url: 'https://cdn.example.com/video.mp4' },
            }),
            { status: 200 }
          )
        );

        await aimlapiVeo3Tool.poll!('gen-123');

        expect(mockAddCost).toHaveBeenCalledOnce();
        expect(mockAddCost).toHaveBeenCalledWith(
          expect.objectContaining({
            step: 'asset:veo3-aimlapi',
            provider: 'aimlapi',
            model: 'veo3-aimlapi',
            type: 'video',
          })
        );
      });

      it('returns failed when completed but no video URL', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'completed', video: {} }), { status: 200 })
        );

        const result = await aimlapiVeo3Tool.poll!('gen-123');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No URL in result');
      });

      it('returns failed when generation fails', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ status: 'failed' }), { status: 200 })
        );

        const result = await aimlapiVeo3Tool.poll!('gen-123');

        expect(result.status).toBe('failed');
        expect(result.error).toBe('aimlapi generation failed');
      });

      it('returns processing on network error', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const result = await aimlapiVeo3Tool.poll!('gen-123');

        expect(result.status).toBe('processing');
      });
    });

    // Shared generate error behavior
    describe('shared generate error behavior (via aimlapiKlingV3Tool)', () => {
      it('returns failed when API key not set', async () => {
        const result = await aimlapiKlingV3Tool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('AIMLAPI_KEY not set');
      });

      it('returns failed on 500 server error', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

        const result = await aimlapiKlingV3Tool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('aimlapi API error (500)');
      });

      it('returns failed when no id in response', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

        const result = await aimlapiKlingV3Tool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toBe('No job ID returned');
      });

      it('handles network error gracefully', async () => {
        process.env.AIMLAPI_KEY = 'aiml-test-key';
        mockFetch.mockRejectedValue(new Error('DNS failure'));

        const result = await aimlapiKlingV3Tool.generate(makeRequest());

        expect(result.status).toBe('failed');
        expect(result.error).toContain('DNS failure');
      });
    });
  });
});
