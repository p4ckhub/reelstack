import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for frame chaining logic (splitChainedTasks).
 * Verifies that consecutive ai-video shots with chainFromPrevious
 * are grouped into sequential chains while others stay parallel.
 */

// We test the split logic by importing the module and calling generateAssets
// with a mock registry. The split function is private, so we test through behavior.

import fsMod from 'fs';

// Mock extractLastFrame to create a real temp file
vi.mock('@reelstack/ffmpeg', () => ({
  extractLastFrame: vi.fn().mockImplementation((_videoPath: string) => {
    const framePath = `/tmp/chain-test-frame-${Date.now()}.jpg`;
    fsMod.writeFileSync(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG header
    return framePath;
  }),
}));
import { storageMockFactory, mockUpload, mockGetSignedUrl } from '../__test-utils__/storage-mock';
vi.mock('@reelstack/storage', storageMockFactory);
mockUpload.mockResolvedValue('ok');
mockGetSignedUrl.mockResolvedValue('https://storage/frame.jpg');
import { loggerMockFactory } from '../__test-utils__/logger-mock';
vi.mock('@reelstack/logger', loggerMockFactory);

// Mock fetch for video download in extractAndUploadLastFrame
import { beforeEach, afterAll } from 'vitest';
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as typeof fetch;
  mockFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(100),
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

import { generateAssets } from '../orchestrator/asset-generator';
import type { ProductionPlan, ShotPlan } from '../types';

function makeShot(id: string, visual: ShotPlan['visual'], chain?: boolean): ShotPlan {
  return {
    id,
    startTime: 0,
    endTime: 5,
    scriptSegment: 'test',
    visual,
    transition: { type: 'crossfade', durationMs: 300 },
    reason: 'test',
    chainFromPrevious: chain,
  };
}

function makePlan(shots: ShotPlan[]): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots,
    effects: [],
    zoomSegments: [],
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments: [],
    layout: 'fullscreen',
    reasoning: 'test',
  };
}

// Mock registry that tracks generation order
function createMockRegistry() {
  const generationOrder: string[] = [];
  const registry = {
    get: (toolId: string) => ({
      id: toolId,
      name: toolId,
      capabilities: [{ assetType: 'ai-video' as const }],
      healthCheck: async () => ({ available: true }),
      generate: async (req: { imageUrl?: string }) => {
        generationOrder.push(`${toolId}${req.imageUrl ? ':chained' : ''}`);
        return {
          jobId: `job-${generationOrder.length}`,
          toolId,
          status: 'completed' as const,
          url: `https://example.com/video-${generationOrder.length}.mp4`,
          durationSeconds: 5,
        };
      },
      poll: async () => ({ status: 'completed' as const }),
    }),
    getByCapability: () => [],
  };
  return { registry, generationOrder };
}

describe('frame chaining', () => {
  it('independent shots generate in parallel (no chainFromPrevious)', async () => {
    const { registry, generationOrder } = createMockRegistry();
    const plan = makePlan([
      makeShot('s1', { type: 'ai-video', prompt: 'scene 1', toolId: 'seedance' }),
      makeShot('s2', { type: 'ai-video', prompt: 'scene 2', toolId: 'seedance' }),
      makeShot('s3', { type: 'ai-video', prompt: 'scene 3', toolId: 'seedance' }),
    ]);

    const assets = await generateAssets(plan, registry as never);
    expect(assets.length).toBe(3);
    // All independent — no :chained suffix
    expect(generationOrder.every((g) => !g.includes(':chained'))).toBe(true);
  });

  it('chained shots generate sequentially with imageUrl injected', async () => {
    const { registry, generationOrder } = createMockRegistry();
    const plan = makePlan([
      makeShot('s1', { type: 'ai-video', prompt: 'scene 1', toolId: 'seedance' }),
      makeShot('s2', { type: 'ai-video', prompt: 'scene 2', toolId: 'seedance' }, true),
      makeShot('s3', { type: 'ai-video', prompt: 'scene 3', toolId: 'seedance' }, true),
    ]);

    const assets = await generateAssets(plan, registry as never);
    expect(assets.length).toBe(3);
    // First shot has no chain reference, subsequent ones do
    expect(generationOrder[0]).toBe('seedance');
    expect(generationOrder[1]).toBe('seedance:chained');
    expect(generationOrder[2]).toBe('seedance:chained');
  });

  it('mixed: independent and chained tasks coexist', async () => {
    const { registry, generationOrder } = createMockRegistry();
    const plan = makePlan([
      makeShot('s1', { type: 'ai-image', prompt: 'image', toolId: 'nanobanana' }),
      makeShot('s2', { type: 'ai-video', prompt: 'scene 1', toolId: 'seedance' }),
      makeShot('s3', { type: 'ai-video', prompt: 'scene 2', toolId: 'seedance' }, true),
      makeShot('s4', { type: 'primary' }),
    ]);

    const assets = await generateAssets(plan, registry as never);
    // s1: independent image, s2+s3: chained video, s4: no task (primary)
    expect(assets.length).toBe(3);
  });

  it('chainFromPrevious without previous shot starts new chain', async () => {
    const { registry, generationOrder } = createMockRegistry();
    const plan = makePlan([
      makeShot('s1', { type: 'ai-video', prompt: 'orphan chain', toolId: 'seedance' }, true),
    ]);

    const assets = await generateAssets(plan, registry as never);
    expect(assets.length).toBe(1);
    // Single task — treated as independent (chain of 1)
    expect(generationOrder[0]).toBe('seedance');
  });
});
