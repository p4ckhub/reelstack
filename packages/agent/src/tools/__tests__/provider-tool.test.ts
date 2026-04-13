import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import * as contextModule from '../../context';
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import {
  ProviderTool,
  createProviderTools,
  type ProviderConfig,
  type ModelConfig,
} from '../provider-tool';

// ── Test helpers ──────────────────────────────────────────────

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'B-roll cinematic shot',
    prompt: 'aerial view of a neon city at night',
    durationSeconds: 5,
    aspectRatio: '9:16',
    ...overrides,
  };
}

/** Bearer-style provider (like kie.ai) */
function makeBearerProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: 'test-bearer',
    envKey: 'TEST_BEARER_KEY',
    buildAuthHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    generateUrl: (model) =>
      `https://api.test-bearer.com/v1/generate/${model.meta?.slug ?? 'default'}`,
    pollUrl: (_model, jobId) => `https://api.test-bearer.com/v1/tasks/${jobId}`,
    extractJobId: (body) => (body as { data?: { taskId?: string } }).data?.taskId,
    extractResultUrl: (body) => {
      const data = body as { data?: { output?: { url?: string } } };
      return data.data?.output?.url;
    },
    extractError: (body) => (body as { data?: { error?: string } }).data?.error,
    mapStatus: (s) => (s === 'completed' ? 'completed' : s === 'failed' ? 'failed' : null),
    ...overrides,
  };
}

/** X-API-Key style provider (like piapi) */
function makeApiKeyProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: 'test-apikey',
    envKey: 'TEST_APIKEY_KEY',
    buildAuthHeaders: (key) => ({ 'X-API-Key': key }),
    generateUrl: () => 'https://api.test-apikey.com/v1/task',
    pollUrl: (_model, jobId) => `https://api.test-apikey.com/v1/task/${jobId}`,
    extractJobId: (body) => (body as { data?: { task_id?: string } }).data?.task_id,
    extractResultUrl: (body) => {
      const data = body as { data?: { output?: { video_url?: string } } };
      return data.data?.output?.video_url;
    },
    extractError: (body) =>
      (body as { data?: { error?: { message?: string } } }).data?.error?.message,
    mapStatus: (s) => (s === 'completed' ? 'completed' : s === 'failed' ? 'failed' : null),
    ...overrides,
  };
}

function makeModelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'test-model',
    name: 'Test Model',
    model: 'test-model-v1',
    assetType: 'ai-video',
    capabilities: [
      {
        assetType: 'ai-video',
        costTier: 'moderate' as const,
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 5000,
        isAsync: true,
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'default prompt',
      duration: req.durationSeconds ?? 5,
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('ProviderTool', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockAddCost.mockReset();
    delete process.env.TEST_BEARER_KEY;
    delete process.env.TEST_APIKEY_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when env var not set', async () => {
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.healthCheck();

      expect(result).toEqual({ available: false, reason: 'TEST_BEARER_KEY not set' });
    });

    it('returns available when env var is set', async () => {
      process.env.TEST_BEARER_KEY = 'my-key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.healthCheck();

      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    it('sends Bearer auth headers', async () => {
      process.env.TEST_BEARER_KEY = 'bearer-secret';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer bearer-secret' })
      );
    });

    it('sends X-API-Key auth headers', async () => {
      process.env.TEST_APIKEY_KEY = 'apikey-secret';
      const tool = new ProviderTool(makeApiKeyProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { task_id: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers).toEqual(expect.objectContaining({ 'X-API-Key': 'apikey-secret' }));
    });

    it('sends correct body (default, no wrapping)', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('aerial view of a neon city at night');
      expect(body.duration).toBe(5);
      expect(body.aspect_ratio).toBe('9:16');
    });

    it('sends raw body when rawBody=true', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const provider = makeBearerProvider({ rawBody: true });
      const tool = new ProviderTool(provider, makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.prompt).toBe('aerial view of a neon city at night');
    });

    it('uses wrapBody when provided', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const provider = makeBearerProvider({
        wrapBody: (input, model) => ({ input, version: model.model }),
      });
      const tool = new ProviderTool(provider, makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.input.prompt).toBe('aerial view of a neon city at night');
      expect(body.version).toBe('test-model-v1');
    });

    it('calls correct endpoint URL', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({ meta: { slug: 'my-model' } });
      const tool = new ProviderTool(makeBearerProvider(), model);
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.test-bearer.com/v1/generate/my-model');
    });

    it('extracts jobId from response', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'extracted-job-123' } }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.jobId).toBe('extracted-job-123');
    });

    it('returns processing status on success', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result).toEqual({
        jobId: 'job-1',
        toolId: 'test-model',
        status: 'processing',
      });
    });

    it('returns failed when API key missing', async () => {
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('TEST_BEARER_KEY not set');
      expect(result.toolId).toBe('test-model');
    });

    it('returns failed on HTTP error', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('test-bearer API error (500)');
    });

    it('returns failed when no jobId in response', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No job ID returned');
    });

    it('returns failed with message from response when no jobId', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Quota exceeded', data: {} }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Quota exceeded');
    });

    it('handles network errors gracefully', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Connection refused');
      expect(result.error).toContain('test-bearer');
    });

    it('includes extra generate headers when configured', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const provider = makeBearerProvider({
        extraGenerateHeaders: { Prefer: 'respond-async' },
      });
      const tool = new ProviderTool(provider, makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      await tool.generate(makeRequest());

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers).toEqual(expect.objectContaining({ Prefer: 'respond-async' }));
    });
  });

  // ── generate (synchronous) ──────────────────────────────────

  describe('generate (synchronous)', () => {
    it('returns completed immediately with URL when synchronous=true', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({ synchronous: true });
      const provider = makeBearerProvider();
      const tool = new ProviderTool(provider, model);
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ data: { output: { url: 'https://cdn.example.com/result.mp4' } } }),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.example.com/result.mp4');
      expect(result.toolId).toBe('test-model');
      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:test-model',
          provider: 'test-bearer',
          model: 'test-model-v1',
          type: 'video',
        })
      );
    });

    it('uses model.parseOutput over provider.extractResultUrl when both available', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({
        synchronous: true,
        parseOutput: (body) => (body as { custom_url?: string }).custom_url,
      });
      const tool = new ProviderTool(makeBearerProvider(), model);
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ custom_url: 'https://cdn.example.com/custom.mp4' }), {
          status: 200,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.example.com/custom.mp4');
    });

    it('returns failed when synchronous but no URL in response', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({ synchronous: true });
      const tool = new ProviderTool(makeBearerProvider(), model);
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { output: {} } }), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in synchronous response');
    });

    it('tracks image type for ai-image assetType', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({ synchronous: true, assetType: 'ai-image' });
      const tool = new ProviderTool(makeBearerProvider(), model);
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ data: { output: { url: 'https://cdn.example.com/img.png' } } }),
          { status: 200 }
        )
      );

      await tool.generate(makeRequest());

      expect(mockAddCost).toHaveBeenCalledWith(expect.objectContaining({ type: 'image' }));
    });
  });

  // ── poll ──────────────────────────────────────────────────────

  describe('poll', () => {
    const JOB_ID = 'test-job-abc123';

    it('sends GET to correct poll URL', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      await tool.poll(JOB_ID);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`https://api.test-bearer.com/v1/tasks/${JOB_ID}`);
      // GET by default (no method specified = GET)
      expect(options.method).toBeUndefined();
    });

    it('sends auth headers in poll request', async () => {
      process.env.TEST_BEARER_KEY = 'my-poll-key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      await tool.poll(JOB_ID);

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer my-poll-key' })
      );
    });

    it('maps completed status and extracts URL', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed',
            data: { output: { url: 'https://cdn.example.com/video.mp4' } },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.example.com/video.mp4');
      expect(result.jobId).toBe(JOB_ID);
      expect(result.toolId).toBe('test-model');
    });

    it('calls addCost on completion', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed',
            data: { output: { url: 'https://cdn.example.com/video.mp4' } },
          }),
          { status: 200 }
        )
      );

      await tool.poll(JOB_ID);

      expect(mockAddCost).toHaveBeenCalledOnce();
      expect(mockAddCost).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'asset:test-model',
          provider: 'test-bearer',
          model: 'test-model-v1',
          type: 'video',
          inputUnits: 1,
        })
      );
    });

    it('tracks image type for ai-image on poll completion', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({ assetType: 'ai-image' });
      const tool = new ProviderTool(makeBearerProvider(), model);
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed',
            data: { output: { url: 'https://cdn.example.com/img.png' } },
          }),
          { status: 200 }
        )
      );

      await tool.poll(JOB_ID);

      expect(mockAddCost).toHaveBeenCalledWith(expect.objectContaining({ type: 'image' }));
    });

    it('uses model.parseOutput over provider.extractResultUrl on poll', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const model = makeModelConfig({
        parseOutput: (body) => (body as { custom?: string }).custom,
      });
      const tool = new ProviderTool(makeBearerProvider(), model);
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'completed', custom: 'https://cdn.example.com/parsed.mp4' }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.example.com/parsed.mp4');
    });

    it('maps failed status and extracts error', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'failed',
            data: { error: 'Content policy violation' },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content policy violation');
    });

    it('returns default error message when extractError returns undefined', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'failed', data: {} }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('test-bearer generation failed');
    });

    it('returns processing for other statuses', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on HTTP error (not failed)', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 503 }));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('returns processing on network error', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('processing');
    });

    it('validates jobId format - rejects query string injection', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.poll('job-id?admin=true');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('validates jobId format - rejects special chars', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.poll('job id with spaces & <script>');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('validates jobId format - rejects empty string', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.poll('');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid jobId format');
    });

    it('validates jobId format - accepts valid chars (alphanumeric, dash, dot, tilde, colon, slash)', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      const result = await tool.poll('abc-123_def.456~ghi:jkl/mno');

      expect(result.status).toBe('processing');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('returns failed when API key not set', async () => {
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('TEST_BEARER_KEY not set');
    });

    it('returns failed when completed but no URL extracted', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ status: 'completed', data: { output: {} } }), { status: 200 })
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL in result');
    });

    it('reads status from nested data.status field', async () => {
      process.env.TEST_APIKEY_KEY = 'key';
      const tool = new ProviderTool(makeApiKeyProvider(), makeModelConfig());
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'completed',
              output: { video_url: 'https://cdn.example.com/video.mp4' },
            },
          }),
          { status: 200 }
        )
      );

      const result = await tool.poll(JOB_ID);

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.example.com/video.mp4');
    });
  });

  // ── createProviderTools ──────────────────────────────────────

  describe('createProviderTools', () => {
    it('creates correct number of tools from config array', () => {
      const provider = makeBearerProvider();
      const models = [
        makeModelConfig({ id: 'tool-a', name: 'Tool A' }),
        makeModelConfig({ id: 'tool-b', name: 'Tool B' }),
        makeModelConfig({ id: 'tool-c', name: 'Tool C' }),
      ];

      const tools = createProviderTools(provider, models);

      expect(tools).toHaveLength(3);
    });

    it('each tool has correct id and name from model config', () => {
      const provider = makeBearerProvider();
      const models = [
        makeModelConfig({ id: 'alpha', name: 'Alpha Model' }),
        makeModelConfig({ id: 'beta', name: 'Beta Model' }),
      ];

      const tools = createProviderTools(provider, models);

      expect(tools[0]!.id).toBe('alpha');
      expect(tools[0]!.name).toBe('Alpha Model');
      expect(tools[1]!.id).toBe('beta');
      expect(tools[1]!.name).toBe('Beta Model');
    });

    it('each tool has capabilities from its model config', () => {
      const provider = makeBearerProvider();
      const models = [
        makeModelConfig({
          id: 'img-tool',
          capabilities: [
            {
              assetType: 'ai-image',
              costTier: 'cheap' as const,
              supportsPrompt: true,
              supportsScript: false,
              estimatedLatencyMs: 3000,
              isAsync: false,
            },
          ],
        }),
        makeModelConfig({
          id: 'vid-tool',
          capabilities: [
            {
              assetType: 'ai-video',
              costTier: 'expensive' as const,
              supportsPrompt: true,
              supportsScript: false,
              estimatedLatencyMs: 10000,
              isAsync: true,
            },
          ],
        }),
      ];

      const tools = createProviderTools(provider, models);

      expect(tools[0]!.capabilities[0]!.assetType).toBe('ai-image');
      expect(tools[1]!.capabilities[0]!.assetType).toBe('ai-video');
    });

    it('returns empty array for empty models array', () => {
      const tools = createProviderTools(makeBearerProvider(), []);

      expect(tools).toEqual([]);
    });

    it('created tools are functional ProviderTool instances', async () => {
      process.env.TEST_BEARER_KEY = 'key';
      const tools = createProviderTools(makeBearerProvider(), [makeModelConfig()]);
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { taskId: 'job-1' } }), { status: 200 })
      );

      const result = await tools[0]!.generate(makeRequest());

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('job-1');
    });
  });

  // ── constructor properties ──────────────────────────────────

  describe('constructor properties', () => {
    it('exposes id, name, capabilities from model config', () => {
      const model = makeModelConfig({
        id: 'my-tool',
        name: 'My Tool',
        capabilities: [
          {
            assetType: 'ai-video',
            costTier: 'cheap' as const,
            supportsPrompt: true,
            supportsScript: false,
            estimatedLatencyMs: 5000,
            isAsync: true,
          },
        ],
        promptGuidelines: 'Use cinematic style',
        pricing: { perRequest: 0.5 },
      });
      const tool = new ProviderTool(makeBearerProvider(), model);

      expect(tool.id).toBe('my-tool');
      expect(tool.name).toBe('My Tool');
      expect(tool.capabilities).toEqual([
        {
          assetType: 'ai-video',
          costTier: 'cheap',
          supportsPrompt: true,
          supportsScript: false,
          estimatedLatencyMs: 5000,
          isAsync: true,
        },
      ]);
      expect(tool.promptGuidelines).toBe('Use cinematic style');
      expect(tool.pricing).toEqual({ perRequest: 0.5 });
    });

    it('promptGuidelines and pricing are optional', () => {
      const tool = new ProviderTool(makeBearerProvider(), makeModelConfig());

      expect(tool.promptGuidelines).toBeUndefined();
      expect(tool.pricing).toBeUndefined();
    });
  });
});
