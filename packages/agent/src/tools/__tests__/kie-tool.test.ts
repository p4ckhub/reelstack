import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import {
  kieKlingTool,
  kieSeedanceTool,
  kieSeedance2Tool,
  kieFluxTool,
  kieWanTool,
  kieNanaBanana2Tool,
  kieVeo31LiteTool,
  kieVeo31FastTool,
  kieVeo31QualityTool,
  allKieTools,
} from '../kie-tool';

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('KieTool', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.KIE_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when KIE_API_KEY not set', async () => {
      const result = await kieKlingTool.healthCheck();
      expect(result).toEqual({ available: false, reason: 'KIE_API_KEY not set' });
    });

    it('returns available when API key is set', async () => {
      process.env.KIE_API_KEY = 'kie-test-key';
      const result = await kieKlingTool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate (Kling) ────────────────────────────────────────

  describe('generate (kieKlingTool)', () => {
    beforeEach(() => {
      process.env.KIE_API_KEY = 'kie-test-key';
    });

    it('sends correct request body with model and task_type', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 'kie-task-1' } }), { status: 200 })
      );

      await kieKlingTool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer kie-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('kling-3.0/video');
      expect(body.task_type).toBe('txt2video');
      expect(body.input.prompt).toBe('aerial view of a neon city at night');
      expect(body.input.duration).toBe('5');
      expect(body.input.aspect_ratio).toBe('9:16');
      expect(body.input.mode).toBe('std');
    });

    it('returns processing with taskId on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 'kie-task-1' } }), { status: 200 })
      );

      const result = await kieKlingTool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'kie-task-1',
        toolId: 'kling-kie',
        status: 'processing',
      });
    });

    it('returns failed when API key not set', async () => {
      delete process.env.KIE_API_KEY;

      const result = await kieKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('KIE_API_KEY not set');
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      const result = await kieKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('kie.ai API error (500)');
    });

    it('returns failed when no taskId in response', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 1, message: 'Quota exceeded' }), { status: 200 })
      );

      const result = await kieKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Quota exceeded');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await kieKlingTool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Connection refused');
    });

    it('clamps Kling duration to [3, 15] as string', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieKlingTool.generate(makeRequest({ durationSeconds: 1 }));
      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe('3');

      mockFetch.mockClear();

      await kieKlingTool.generate(makeRequest({ durationSeconds: 20 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe('15');
    });

    it('uses default prompt when none provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieKlingTool.generate(makeRequest({ prompt: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.prompt).toBe('abstract cinematic background');
    });
  });

  // ── generate (Seedance) ─────────────────────────────────────

  describe('generate (kieSeedanceTool)', () => {
    beforeEach(() => {
      process.env.KIE_API_KEY = 'kie-test-key';
    });

    it('rounds duration to nearest valid Seedance value [4, 8, 12]', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      // 5 is closer to 4
      await kieSeedanceTool.generate(makeRequest({ durationSeconds: 5 }));
      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe('4');

      mockFetch.mockClear();

      // 7 is closer to 8
      await kieSeedanceTool.generate(makeRequest({ durationSeconds: 7 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe('8');

      mockFetch.mockClear();

      // 11 is closer to 12
      await kieSeedanceTool.generate(makeRequest({ durationSeconds: 11 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe('12');
    });

    it('sends correct model for Seedance', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieSeedanceTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('bytedance/seedance-1.5-pro');
      expect(body.input.resolution).toBe('720p');
    });
  });

  // ── generate (Seedance 2) ───────────────────────────────────

  describe('generate (kieSeedance2Tool)', () => {
    beforeEach(() => {
      process.env.KIE_API_KEY = 'kie-test-key';
    });

    it('passes first_frame_url from imageUrl', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieSeedance2Tool.generate(makeRequest({ imageUrl: 'https://example.com/frame.png' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.first_frame_url).toBe('https://example.com/frame.png');
    });

    it('passes reference_audio_urls from audioUrl', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieSeedance2Tool.generate(makeRequest({ audioUrl: 'https://example.com/audio.mp3' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.reference_audio_urls).toEqual(['https://example.com/audio.mp3']);
    });

    it('passes reference_image_urls from referenceImageUrl', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieSeedance2Tool.generate(
        makeRequest({ referenceImageUrl: 'https://example.com/ref.png' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.reference_image_urls).toEqual(['https://example.com/ref.png']);
    });

    it('omits optional fields when not provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieSeedance2Tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.first_frame_url).toBeUndefined();
      expect(body.input.reference_audio_urls).toBeUndefined();
      expect(body.input.reference_image_urls).toBeUndefined();
    });

    it('clamps duration to [3, 15]', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieSeedance2Tool.generate(makeRequest({ durationSeconds: 1 }));
      let body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe(3);

      mockFetch.mockClear();

      await kieSeedance2Tool.generate(makeRequest({ durationSeconds: 20 }));
      body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.duration).toBe(15);
    });
  });

  // ── generate (Flux image) ───────────────────────────────────

  describe('generate (kieFluxTool)', () => {
    beforeEach(() => {
      process.env.KIE_API_KEY = 'kie-test-key';
    });

    it('sends txt2img task_type for Flux', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 't1' } }), { status: 200 })
      );

      await kieFluxTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('flux-schnell');
      expect(body.task_type).toBe('txt2img');
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'kie-task-abc';

    beforeEach(() => {
      process.env.KIE_API_KEY = 'kie-test-key';
    });

    it('returns completed with URL and calls addCost on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              taskId: JOB_ID,
              state: 'success',
              resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie.ai/video.mp4'] }),
              costTime: 45000,
            },
          }),
          { status: 200 }
        )
      );

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.kie.ai/video.mp4');
      expect(result.toolId).toBe('kling-kie');
      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:kling-kie',
          provider: 'kie',
          model: 'kling-3.0/video',
          type: 'video',
          durationMs: 45000,
        })
      );
    });

    it('returns failed on fail state', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              taskId: JOB_ID,
              state: 'fail',
              failMsg: 'Content policy violation',
            },
          }),
          { status: 200 }
        )
      );

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content policy violation');
    });

    it('returns failed with default message when failMsg is null', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: { taskId: JOB_ID, state: 'fail', failMsg: null },
          }),
          { status: 200 }
        )
      );

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('kie.ai generation failed');
    });

    it('returns processing for waiting/queuing/generating states', async () => {
      for (const state of ['waiting', 'queuing', 'generating']) {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 0, data: { taskId: JOB_ID, state } }), {
            status: 200,
          })
        );

        const result = await kieKlingTool.poll!(JOB_ID);
        expect(result.status).toBe('processing');
      }
    });

    it('returns processing when no task data', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: null }), { status: 200 })
      );

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on non-ok HTTP status', async () => {
      mockFetch.mockResolvedValue(new Response('Error', { status: 503 }));

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('rejects invalid jobId format', async () => {
      const result = await kieKlingTool.poll!('../../../etc/passwd');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.KIE_API_KEY;

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('KIE_API_KEY not set');
    });

    it('returns failed when success but no URL in resultJson', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              taskId: JOB_ID,
              state: 'success',
              resultJson: JSON.stringify({ resultUrls: [] }),
            },
          }),
          { status: 200 }
        )
      );

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in kie.ai result');
    });

    it('returns failed when resultJson is invalid JSON', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              taskId: JOB_ID,
              state: 'success',
              resultJson: 'not-json',
            },
          }),
          { status: 200 }
        )
      );

      const result = await kieKlingTool.poll!(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in kie.ai result');
    });

    it('tracks image type for txt2img tools', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              taskId: JOB_ID,
              state: 'success',
              resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie.ai/img.png'] }),
              costTime: 5000,
            },
          }),
          { status: 200 }
        )
      );

      await kieFluxTool.poll!(JOB_ID);

      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image',
          model: 'flux-schnell',
        })
      );
    });

    it('sends GET request to correct endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { state: 'waiting' } }), { status: 200 })
      );

      await kieKlingTool.poll!(JOB_ID);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${JOB_ID}`);
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('kieKlingTool has correct id and name', () => {
      expect(kieKlingTool.id).toBe('kling-kie');
      expect(kieKlingTool.name).toBe('Kling 3.0 via kie.ai');
    });

    it('kieSeedance2Tool has correct id', () => {
      expect(kieSeedance2Tool.id).toBe('seedance2-kie');
    });

    it('kieFluxTool is an image tool', () => {
      expect(kieFluxTool.capabilities[0]!.assetType).toBe('ai-image');
    });

    it('kieWanTool has cheap cost tier', () => {
      expect(kieWanTool.capabilities[0]!.costTier).toBe('cheap');
    });

    it('kieNanaBanana2Tool is an image tool', () => {
      expect(kieNanaBanana2Tool.capabilities[0]!.assetType).toBe('ai-image');
      expect(kieNanaBanana2Tool.id).toBe('nanobanana2-kie');
    });
  });

  // ── Veo 3.1 KIE tools ────────────────────────────────────────

  describe('Veo 3.1 KIE tools', () => {
    beforeEach(() => {
      process.env.KIE_API_KEY = 'kie-test-key';
    });

    it('veo31-lite uses /api/v1/veo/generate endpoint with raw body', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 'veo-task-1' } }), { status: 200 })
      );

      await kieVeo31LiteTool.generate(makeRequest());

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.kie.ai/api/v1/veo/generate');

      const body = JSON.parse(options.body as string);
      // Raw body: no model/task_type/input wrapper
      expect(body.model).toBe('veo3_lite');
      expect(body.prompt).toBe('aerial view of a neon city at night');
      expect(body.aspect_ratio).toBe('9:16');
      expect(body.generationType).toBe('TEXT_2_VIDEO');
      // No task_type or input wrapper
      expect(body.task_type).toBeUndefined();
      expect(body.input).toBeUndefined();
    });

    it('veo31-fast uses veo3_fast model', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 'veo-task-2' } }), { status: 200 })
      );

      await kieVeo31FastTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('veo3_fast');
    });

    it('veo31-quality uses veo3 model', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 'veo-task-3' } }), { status: 200 })
      );

      await kieVeo31QualityTool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('veo3');
    });

    it('veo31 passes imageUrls for image-to-video', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { taskId: 'veo-task-4' } }), { status: 200 })
      );

      await kieVeo31LiteTool.generate(makeRequest({ imageUrl: 'https://example.com/frame.png' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.generationType).toBe('FIRST_AND_LAST_FRAMES_2_VIDEO');
      expect(body.imageUrls).toEqual(['https://example.com/frame.png']);
    });

    it('veo31-lite has self-declared pricing', () => {
      expect(kieVeo31LiteTool.pricing).toEqual({ perRequest: 0.15 });
    });

    it('veo31-fast has self-declared pricing', () => {
      expect(kieVeo31FastTool.pricing).toEqual({ perRequest: 0.5 });
    });

    it('veo31-quality has self-declared pricing', () => {
      expect(kieVeo31QualityTool.pricing).toEqual({ perRequest: 1.0 });
    });

    it('all three are in allKieTools catalog', () => {
      const ids = allKieTools.map((t) => t.id);
      expect(ids).toContain('veo31-lite-kie');
      expect(ids).toContain('veo31-fast-kie');
      expect(ids).toContain('veo31-quality-kie');
    });
  });

  // ── allKieTools catalog ───────────────────────────────────────

  describe('allKieTools catalog', () => {
    it('contains all 11 KIE tools', () => {
      expect(allKieTools).toHaveLength(11);
    });

    it('has no duplicate IDs', () => {
      const ids = allKieTools.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
