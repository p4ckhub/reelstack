import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import * as ffmpegModule from '@reelstack/ffmpeg';
import * as storageModule from '@reelstack/storage';

// ── Spies (restored in afterAll to prevent leaking) ───────────

const mockMkdtempSync = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/chain-frame-mock' as any);
const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
const mockReadFileSync = vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('frame-data'));
const mockRmSync = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
const mockExtractLastFrame = vi
  .spyOn(ffmpegModule, 'extractLastFrame' as any)
  .mockReturnValue('/tmp/chain-frame-xxx/frame.jpg');

const mockUpload = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue('https://r2.example.com/frame.jpg');
const mockCreateStorage = vi.spyOn(storageModule, 'createStorage' as any).mockResolvedValue({
  upload: (...args: unknown[]) => mockUpload(...args),
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
});

// isPublicUrl is NOT mocked. Real implementation from utils/url-validation works fine
// with test URLs (all https://cdn.example.com/...). No vi.mock means no contamination
// of other test files in bun's single-process runner.

vi.mock('../../polling', () => ({
  pollUntilDone: vi.fn(),
}));

afterAll(() => {
  mockMkdtempSync.mockRestore();
  mockWriteFileSync.mockRestore();
  mockReadFileSync.mockRestore();
  mockRmSync.mockRestore();
  mockExtractLastFrame.mockRestore();
  mockCreateStorage.mockRestore();
});

import { generateAssets } from '../asset-generator';
import type { ProductionPlan, GeneratedAsset, AssetGenerationJob } from '../../types';
import type { ToolRegistry } from '../../registry/tool-registry';
import type { ProductionTool } from '../../registry/tool-interface';

// ── Helpers ────────────────────────────────────────────────────

function makeTool(overrides: Partial<ProductionTool> = {}): ProductionTool {
  return {
    id: 'test-tool',
    name: 'Test Tool',
    capabilities: [
      {
        assetType: 'ai-video',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 5000,
        isAsync: false,
        costTier: 'cheap',
      },
    ],
    healthCheck: vi.fn().mockResolvedValue({ available: true }),
    generate: vi.fn().mockResolvedValue({
      jobId: 'job-1',
      toolId: 'test-tool',
      status: 'completed',
      url: 'https://cdn.example.com/video.mp4',
    } satisfies AssetGenerationJob),
    ...overrides,
  };
}

function makeRegistry(tools: ProductionTool[]): ToolRegistry {
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  return {
    register: vi.fn(),
    get: (id: string) => toolMap.get(id),
    getAll: () => tools,
    getByCapability: (assetType: string) =>
      tools.filter((t) => t.capabilities.some((c) => c.assetType === assetType)),
    getManifest: vi.fn().mockReturnValue({ tools: [], summary: '' }),
  } as unknown as ToolRegistry;
}

function makeMinimalPlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [],
    effects: [],
    zoomSegments: [],
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments: [],
    layout: 'fullscreen',
    reasoning: 'test plan',
    ...overrides,
  };
}

// ── splitChainedTasks (tested via generateAssets) ──────────────

describe('generateAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when plan has no tasks', async () => {
    const plan = makeMinimalPlan();
    const registry = makeRegistry([]);

    const result = await generateAssets(plan, registry);

    expect(result).toEqual([]);
  });

  it('generates primary avatar asset', async () => {
    const tool = makeTool({ id: 'heygen' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'heygen',
      status: 'completed',
      url: 'https://cdn.example.com/avatar.mp4',
    });

    const plan = makeMinimalPlan({
      primarySource: {
        type: 'avatar',
        toolId: 'heygen',
        script: 'Hello world',
        voice: 'en-US',
      },
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(1);
    expect(result[0].toolId).toBe('heygen');
    expect(result[0].url).toBe('https://cdn.example.com/avatar.mp4');
    expect(result[0].shotId).toBeUndefined();
  });

  it('generates primary ai-video asset', async () => {
    const tool = makeTool({ id: 'veo31' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'veo31',
      status: 'completed',
      url: 'https://cdn.example.com/ai-vid.mp4',
    });

    const plan = makeMinimalPlan({
      primarySource: {
        type: 'ai-video',
        toolId: 'veo31',
        prompt: 'Cinematic landscape',
      },
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(1);
    expect(result[0].toolId).toBe('veo31');
  });

  it('generates shot-level b-roll assets', async () => {
    const tool = makeTool({ id: 'pexels' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'pexels',
      status: 'completed',
      url: 'https://cdn.example.com/broll.mp4',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'b-roll', searchQuery: 'city skyline', toolId: 'pexels' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'establishing shot',
        },
      ],
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(1);
    expect(result[0].shotId).toBe('shot-1');
  });

  it('generates shot-level ai-image assets', async () => {
    const tool = makeTool({
      id: 'flux',
      capabilities: [
        {
          assetType: 'ai-image',
          supportsPrompt: true,
          supportsScript: false,
          estimatedLatencyMs: 3000,
          isAsync: false,
          costTier: 'cheap',
        },
      ],
    });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'flux',
      status: 'completed',
      url: 'https://cdn.example.com/image.jpg',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-image', prompt: 'futuristic city', toolId: 'flux' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'illustration',
        },
      ],
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ai-image');
  });

  it('skips primary and text-card shots (no generation needed)', async () => {
    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'primary' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'presenter',
        },
        {
          id: 'shot-2',
          startTime: 3,
          endTime: 6,
          scriptSegment: 'test',
          visual: { type: 'text-card', headline: 'Title', background: '#000' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'title card',
        },
      ],
    });
    const registry = makeRegistry([]);

    const result = await generateAssets(plan, registry);

    expect(result).toEqual([]);
  });

  it('handles tool not found in registry gracefully', async () => {
    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'b-roll', searchQuery: 'city', toolId: 'nonexistent-tool' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([]);

    const result = await generateAssets(plan, registry);

    // Tool not found returns null, so no assets
    expect(result).toEqual([]);
  });

  it('handles generation failure (status=failed)', async () => {
    const tool = makeTool({ id: 'veo31' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'veo31',
      status: 'failed',
      error: 'Content policy violation',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toEqual([]);
  });

  it('handles generation throwing an error', async () => {
    const tool = makeTool({ id: 'veo31' });
    (tool.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API timeout'));

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toEqual([]);
  });

  it('polls async jobs until completion', async () => {
    const { pollUntilDone } = await import('../../polling');
    const tool = makeTool({ id: 'heygen' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'async-j1',
      toolId: 'heygen',
      status: 'pending',
    });
    (pollUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'async-j1',
      toolId: 'heygen',
      status: 'completed',
      url: 'https://cdn.example.com/result.mp4',
    });

    const plan = makeMinimalPlan({
      primarySource: {
        type: 'avatar',
        toolId: 'heygen',
        script: 'Hello',
      },
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(pollUntilDone).toHaveBeenCalledWith(tool, 'async-j1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/result.mp4');
  });

  it('calls onProgress callback', async () => {
    const tool = makeTool({ id: 'pexels' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'pexels',
      status: 'completed',
      url: 'https://cdn.example.com/broll.mp4',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'b-roll', searchQuery: 'city', toolId: 'pexels' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([tool]);
    const onProgress = vi.fn();

    await generateAssets(plan, registry, onProgress);

    expect(onProgress).toHaveBeenCalledWith('Generating 1 asset(s)...');
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Asset ready'));
  });

  it('tries fallback tools when primary fails', async () => {
    const primaryTool = makeTool({ id: 'veo31' });
    (primaryTool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'veo31',
      status: 'failed',
      error: 'Rate limit',
    });

    const fallbackTool = makeTool({ id: 'kling-fal' });
    (fallbackTool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j2',
      toolId: 'kling-fal',
      status: 'completed',
      url: 'https://cdn.example.com/fallback.mp4',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([primaryTool, fallbackTool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(1);
    expect(result[0].toolId).toBe('kling-fal');
    expect(result[0].url).toBe('https://cdn.example.com/fallback.mp4');
  });

  it('excludes pexels from fallback chain', async () => {
    const primaryTool = makeTool({ id: 'veo31' });
    (primaryTool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'veo31',
      status: 'failed',
      error: 'Failed',
    });

    const pexelsTool = makeTool({ id: 'pexels' });
    // pexels should never be called as fallback
    (pexelsTool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j2',
      toolId: 'pexels',
      status: 'completed',
      url: 'https://cdn.example.com/stock.mp4',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([primaryTool, pexelsTool]);

    const result = await generateAssets(plan, registry);

    expect(pexelsTool.generate).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('rejects tool URL that is not public and not a local path', async () => {
    const tool = makeTool({ id: 'veo31' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'veo31',
      status: 'completed',
      url: 'ftp://internal.server/video.mp4',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toEqual([]);
  });

  it('accepts local file path starting with /', async () => {
    const tool = makeTool({ id: 'veo31' });
    (tool.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      jobId: 'j1',
      toolId: 'veo31',
      status: 'completed',
      url: '/tmp/reelstack/output.mp4',
    });

    const plan = makeMinimalPlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 3,
          scriptSegment: 'test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
          transition: { type: 'crossfade', durationMs: 300 },
          reason: 'test',
        },
      ],
    });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('/tmp/reelstack/output.mp4');
  });
});

// ── splitChainedTasks logic (tested indirectly) ────────────────

describe('splitChainedTasks (via generateAssets)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('runs independent tasks in parallel batches', async () => {
    const generateCalls: number[] = [];
    const tool = makeTool({ id: 'pexels' });
    (tool.generate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      generateCalls.push(Date.now());
      return {
        jobId: `j-${generateCalls.length}`,
        toolId: 'pexels',
        status: 'completed',
        url: `https://cdn.example.com/vid-${generateCalls.length}.mp4`,
      };
    });

    const shots = Array.from({ length: 3 }, (_, i) => ({
      id: `shot-${i}`,
      startTime: i * 3,
      endTime: (i + 1) * 3,
      scriptSegment: 'test',
      visual: { type: 'b-roll' as const, searchQuery: 'city', toolId: 'pexels' },
      transition: { type: 'crossfade', durationMs: 300 },
      reason: 'test',
    }));

    const plan = makeMinimalPlan({ shots });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    expect(result).toHaveLength(3);
    expect(tool.generate).toHaveBeenCalledTimes(3);
  });

  it('runs chained ai-video tasks sequentially', async () => {
    const tool = makeTool({ id: 'veo31' });
    let callCount = 0;
    (tool.generate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      return {
        jobId: `j-${callCount}`,
        toolId: 'veo31',
        status: 'completed',
        url: `https://cdn.example.com/vid-${callCount}.mp4`,
        durationSeconds: 5,
      };
    });

    // Mock fetch for frame extraction download
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    }) as unknown as typeof fetch;

    const shots = [
      {
        id: 'shot-0',
        startTime: 0,
        endTime: 5,
        scriptSegment: 'intro',
        visual: { type: 'ai-video' as const, prompt: 'opening scene', toolId: 'veo31' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'opening',
      },
      {
        id: 'shot-1',
        startTime: 5,
        endTime: 10,
        scriptSegment: 'middle',
        visual: { type: 'ai-video' as const, prompt: 'continuation', toolId: 'veo31' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'continuation',
        chainFromPrevious: true,
      },
    ];

    const plan = makeMinimalPlan({ shots });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    // Both shots should have generated assets
    expect(result).toHaveLength(2);
    // The second call should have received imageUrl from frame extraction
    expect(tool.generate).toHaveBeenCalledTimes(2);
  });

  it('handles chain break when asset generation fails', async () => {
    const tool = makeTool({ id: 'veo31' });
    let callCount = 0;
    (tool.generate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { jobId: 'j1', toolId: 'veo31', status: 'failed', error: 'Content policy' };
      }
      return {
        jobId: `j-${callCount}`,
        toolId: 'veo31',
        status: 'completed',
        url: `https://cdn.example.com/vid-${callCount}.mp4`,
      };
    });

    const shots = [
      {
        id: 'shot-0',
        startTime: 0,
        endTime: 5,
        scriptSegment: 'intro',
        visual: { type: 'ai-video' as const, prompt: 'opening', toolId: 'veo31' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'opening',
      },
      {
        id: 'shot-1',
        startTime: 5,
        endTime: 10,
        scriptSegment: 'middle',
        visual: { type: 'ai-video' as const, prompt: 'continuation', toolId: 'veo31' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'continuation',
        chainFromPrevious: true,
      },
    ];

    const plan = makeMinimalPlan({ shots });
    const registry = makeRegistry([tool]);

    const result = await generateAssets(plan, registry);

    // First shot failed, second should still attempt (without imageUrl)
    expect(result).toHaveLength(1);
    expect(result[0].shotId).toBe('shot-1');
  });
});
