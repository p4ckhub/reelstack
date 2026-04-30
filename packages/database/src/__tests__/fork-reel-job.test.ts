/**
 * `forkReelJob` lets the resume API spawn a child ReelJob that inherits
 * the source's pipeline cache (MinIO `jobs/{sourceId}/`) but renders
 * with `configOverrides` deep-merged into `reelConfig`. Used to swap
 * end-card platforms / caption styles / TTS voice without re-running
 * the full pipeline.
 *
 * Contract:
 *   - source must exist, belong to caller, be COMPLETED
 *   - configOverrides keys are validated against an allow-list
 *   - new job has `sourceJobId` pointer, `forkedAt`, status QUEUED,
 *     creditCost defaults to 0 (cost lives upstream on the parent)
 *   - reelConfig = deepMerge(source.reelConfig, configOverrides)
 *   - script / language / userId / apiKeyId inherited from source
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReelJobCreate, mockReelJobFindUnique } from './prisma-mock';

vi.mock('@prisma/client', async () => {
  const { prismaMockFactory } = await import('./prisma-mock');
  return prismaMockFactory();
});

const { forkReelJob, FORK_OVERRIDABLE_KEYS } = await import('../reel-jobs');

const SOURCE_BASE = {
  id: 'source-1',
  userId: 'user-1',
  status: 'COMPLETED' as const,
  script: 'cached script',
  language: 'pl',
  apiKeyId: 'key-1',
  reelConfig: {
    mode: 'n8n-explainer',
    workflowUrl: 'https://n8n.io/workflows/2813',
    language: 'pl',
    runtime: 'hyperframes',
    endCard: { platform: 'ig', enabled: true, durationSeconds: 4 },
    tts: { provider: 'gemini-tts', voice: 'Charon' },
  },
  outputUrl: 'https://r2/parent.mp4',
  creditCost: 10,
  parentJobId: null,
  sourceJobId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReelJobCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'child-1', ...data }));
});

describe('FORK_OVERRIDABLE_KEYS', () => {
  it('exposes the allow-list so the resume route shares one source of truth', () => {
    expect(FORK_OVERRIDABLE_KEYS).toContain('endCard');
    expect(FORK_OVERRIDABLE_KEYS).toContain('captionStyle');
    expect(FORK_OVERRIDABLE_KEYS).toContain('tts');
    expect(FORK_OVERRIDABLE_KEYS).toContain('brandPreset');
    expect(FORK_OVERRIDABLE_KEYS).toContain('scrollStopper');
    expect(FORK_OVERRIDABLE_KEYS).toContain('highlightMode');
    // Cache-invalidating keys must NOT be in the list — overriding them
    // would render cached step outputs (workflow JSON, TTS audio, …) inconsistent.
    expect(FORK_OVERRIDABLE_KEYS).not.toContain('workflowUrl');
    expect(FORK_OVERRIDABLE_KEYS).not.toContain('mode');
    expect(FORK_OVERRIDABLE_KEYS).not.toContain('language');
    expect(FORK_OVERRIDABLE_KEYS).not.toContain('script');
  });
});

describe('forkReelJob', () => {
  it('rejects when source job does not exist', async () => {
    mockReelJobFindUnique.mockResolvedValue(null);
    await expect(
      forkReelJob({ sourceJobId: 'missing', userId: 'user-1', configOverrides: {} })
    ).rejects.toThrow(/not found/i);
  });

  it('rejects when caller does not own the source', async () => {
    mockReelJobFindUnique.mockResolvedValue({ ...SOURCE_BASE, userId: 'other-user' });
    await expect(
      forkReelJob({ sourceJobId: 'source-1', userId: 'user-1', configOverrides: {} })
    ).rejects.toThrow(/not found/i); // Don't leak existence to wrong user.
  });

  it('rejects when source is not COMPLETED', async () => {
    mockReelJobFindUnique.mockResolvedValue({ ...SOURCE_BASE, status: 'PROCESSING' });
    await expect(
      forkReelJob({ sourceJobId: 'source-1', userId: 'user-1', configOverrides: {} })
    ).rejects.toThrow(/COMPLETED/i);
  });

  it('rejects keys outside the allow-list', async () => {
    mockReelJobFindUnique.mockResolvedValue(SOURCE_BASE);
    await expect(
      forkReelJob({
        sourceJobId: 'source-1',
        userId: 'user-1',
        configOverrides: { workflowUrl: 'https://different' } as Record<string, unknown>,
      })
    ).rejects.toThrow(/cannot override/i);
  });

  it('creates a child job with sourceJobId pointer + status QUEUED + creditCost 0', async () => {
    mockReelJobFindUnique.mockResolvedValue(SOURCE_BASE);
    const child = await forkReelJob({
      sourceJobId: 'source-1',
      userId: 'user-1',
      configOverrides: { endCard: { platform: 'fb' } },
    });

    expect(mockReelJobCreate).toHaveBeenCalledOnce();
    const createArg = mockReelJobCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(createArg.data).toMatchObject({
      userId: 'user-1',
      sourceJobId: 'source-1',
      status: 'QUEUED',
      creditCost: 0,
      script: 'cached script',
      language: 'pl',
      apiKeyId: 'key-1',
    });
    expect(createArg.data.forkedAt).toBeInstanceOf(Date);
    expect(child.id).toBe('child-1');
  });

  it('deep-merges configOverrides into source.reelConfig', async () => {
    mockReelJobFindUnique.mockResolvedValue(SOURCE_BASE);
    await forkReelJob({
      sourceJobId: 'source-1',
      userId: 'user-1',
      configOverrides: { endCard: { platform: 'youtube' } },
    });

    const createArg = mockReelJobCreate.mock.calls[0]![0] as {
      data: { reelConfig: Record<string, unknown> };
    };
    expect(createArg.data.reelConfig).toMatchObject({
      mode: 'n8n-explainer', // preserved
      workflowUrl: 'https://n8n.io/workflows/2813', // preserved
      tts: { provider: 'gemini-tts', voice: 'Charon' }, // preserved
      endCard: {
        platform: 'youtube', // overridden
        enabled: true, // preserved from source
        durationSeconds: 4, // preserved from source
      },
    });
  });

  it('overrides leave unrelated nested keys untouched', async () => {
    mockReelJobFindUnique.mockResolvedValue(SOURCE_BASE);
    await forkReelJob({
      sourceJobId: 'source-1',
      userId: 'user-1',
      configOverrides: { tts: { voice: 'Aoede' } },
    });

    const createArg = mockReelJobCreate.mock.calls[0]![0] as {
      data: { reelConfig: Record<string, unknown> };
    };
    expect(createArg.data.reelConfig).toMatchObject({
      tts: { provider: 'gemini-tts', voice: 'Aoede' }, // voice overridden, provider preserved
      endCard: { platform: 'ig', enabled: true, durationSeconds: 4 }, // untouched
    });
  });

  it('passes through with empty configOverrides (no-op fork = re-render)', async () => {
    mockReelJobFindUnique.mockResolvedValue(SOURCE_BASE);
    await forkReelJob({
      sourceJobId: 'source-1',
      userId: 'user-1',
      configOverrides: {},
    });
    const createArg = mockReelJobCreate.mock.calls[0]![0] as {
      data: { reelConfig: unknown };
    };
    expect(createArg.data.reelConfig).toEqual(SOURCE_BASE.reelConfig);
  });

  it('rejects null source.reelConfig (cannot fork an unconfigured job)', async () => {
    mockReelJobFindUnique.mockResolvedValue({ ...SOURCE_BASE, reelConfig: null });
    await expect(
      forkReelJob({ sourceJobId: 'source-1', userId: 'user-1', configOverrides: {} })
    ).rejects.toThrow(/reelConfig/i);
  });
});
