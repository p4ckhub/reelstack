/**
 * `createMatrix()` is the entry point for `POST /api/v1/reel/matrix`.
 *
 * Contract:
 *   - dimensions split into BASE (cache-invalidating, full pipeline per
 *     value) and FORK_FREE (re-render from `assemble-props`, free).
 *   - Total cells = product of cardinalities. Hard limits prevent
 *     accidental cost explosions.
 *   - Returns ReelBatch row + N base ReelJobs already created. Forks
 *     are created later by the worker hook (`tryAdvanceMatrix`) when
 *     each base reaches COMPLETED.
 *   - Cell key = pipe-joined dimension values in dimension-key sort order
 *     (e.g. `"pl|ig"` for {language: pl, endCard.platform: ig}). Used
 *     by status aggregation + worker hook to identify cells.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReelBatchCreate = vi.fn();
const mockReelJobCreateMany = vi.fn();
const mockReelJobCreate = vi.fn();
const mockTransaction = vi.fn();
const mockEnqueue = vi.fn();

vi.mock('@reelstack/database', () => ({
  prisma: {
    reelBatch: { create: (...a: unknown[]) => mockReelBatchCreate(...a) },
    reelJob: {
      create: (...a: unknown[]) => mockReelJobCreate(...a),
      createMany: (...a: unknown[]) => mockReelJobCreateMany(...a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          reelBatch: { create: (...a: unknown[]) => mockReelBatchCreate(...a) },
          reelJob: { create: (...a: unknown[]) => mockReelJobCreate(...a) },
        })
      )(fn),
  },
}));

vi.mock('@reelstack/queue', () => ({
  createQueue: vi.fn().mockResolvedValue({
    enqueue: (...a: unknown[]) => mockEnqueue(...a),
  }),
}));

const {
  createMatrix,
  expandDimensions,
  classifyDimensionKey,
  cellKey,
  BASE_DIMENSIONS,
  FORK_FREE_DIMENSIONS,
  MATRIX_LIMITS,
} = await import('../matrix');

beforeEach(() => {
  vi.clearAllMocks();
  mockReelBatchCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'batch-1', ...data }));
  mockReelJobCreate.mockImplementation(({ data }) => {
    return Promise.resolve({ id: `job-${data.batchCellKey ?? 'x'}`, ...data });
  });
  mockEnqueue.mockResolvedValue(undefined);
});

describe('classifyDimensionKey', () => {
  it('language is a BASE dimension (cache-invalidating)', () => {
    expect(classifyDimensionKey('language')).toBe('base');
  });

  it('endCard, captionStyle, brandPreset, scrollStopper, highlightMode are FORK_FREE', () => {
    for (const key of FORK_FREE_DIMENSIONS) {
      expect(classifyDimensionKey(key)).toBe('fork');
    }
  });

  it('nested keys (e.g. endCard.platform) classify by their root', () => {
    expect(classifyDimensionKey('endCard.platform')).toBe('fork');
    expect(classifyDimensionKey('captionStyle.position')).toBe('fork');
  });

  it('unknown keys return null (resolver / route should reject)', () => {
    expect(classifyDimensionKey('mode')).toBe(null);
    expect(classifyDimensionKey('workflowUrl')).toBe(null);
    expect(classifyDimensionKey('tts.voice')).toBe(null); // paid: explicit opt-in only
    expect(classifyDimensionKey('runtime')).toBe(null);
  });
});

describe('cellKey', () => {
  it('joins dimension values in dimension-key sort order with pipe', () => {
    expect(cellKey({ language: 'pl', 'endCard.platform': 'ig' })).toBe('ig|pl');
    // Same input regardless of insertion order
    expect(cellKey({ 'endCard.platform': 'fb', language: 'en' })).toBe('fb|en');
  });

  it('handles a single dimension', () => {
    expect(cellKey({ language: 'pl' })).toBe('pl');
  });
});

describe('expandDimensions', () => {
  it('cartesian-products dimension values into a list of cells', () => {
    const cells = expandDimensions({
      language: ['pl', 'en'],
      'endCard.platform': ['ig', 'fb'],
    });
    expect(cells).toHaveLength(4);
    expect(cells).toEqual(
      expect.arrayContaining([
        { language: 'pl', 'endCard.platform': 'ig' },
        { language: 'pl', 'endCard.platform': 'fb' },
        { language: 'en', 'endCard.platform': 'ig' },
        { language: 'en', 'endCard.platform': 'fb' },
      ])
    );
  });

  it('returns a single empty cell when given no dimensions', () => {
    expect(expandDimensions({})).toEqual([{}]);
  });
});

describe('createMatrix - validation', () => {
  it('rejects an empty dimensions map (use /generate instead)', async () => {
    await expect(
      createMatrix({
        userId: 'user-1',
        base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
        dimensions: {},
      })
    ).rejects.toThrow(/dimensions/i);
  });

  it('rejects unknown dimension keys with a clear hint', async () => {
    await expect(
      createMatrix({
        userId: 'user-1',
        base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
        dimensions: { workflowUrl: ['https://a', 'https://b'] },
      })
    ).rejects.toThrow(/workflowUrl/);
  });

  it('rejects empty dimension values', async () => {
    await expect(
      createMatrix({
        userId: 'user-1',
        base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
        dimensions: { language: [] },
      })
    ).rejects.toThrow(/at least one value/i);
  });

  it('rejects when total cells exceed MATRIX_LIMITS.maxCells (cost guard)', async () => {
    const tooMany: Record<string, string[]> = {
      'endCard.platform': Array.from({ length: 25 }, (_, i) => `p${i}`),
    };
    await expect(
      createMatrix({
        userId: 'user-1',
        base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
        dimensions: tooMany,
      })
    ).rejects.toThrow(/maxCells/);
  });

  it('rejects when base jobs exceed MATRIX_LIMITS.maxBaseJobs (cost guard)', async () => {
    // Many languages → too many full pipelines.
    const langs = Array.from({ length: MATRIX_LIMITS.maxBaseJobs + 1 }, (_, i) => `l${i}`);
    await expect(
      createMatrix({
        userId: 'user-1',
        base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
        dimensions: { language: langs },
      })
    ).rejects.toThrow(/maxBaseJobs/);
  });
});

describe('createMatrix - happy path', () => {
  it('creates one base job per BASE dim combination + returns cell summary', async () => {
    const result = await createMatrix({
      userId: 'user-1',
      base: { mode: 'n8n-explainer', workflowUrl: 'https://x', endCard: { durationSeconds: 4 } },
      dimensions: {
        language: ['pl', 'en'],
        'endCard.platform': ['ig', 'fb', 'tiktok'],
      },
    });

    expect(result.totalCells).toBe(6); // 2 langs × 3 platforms
    expect(result.baseJobs).toBe(2); // one base per language
    expect(result.forkJobs).toBe(4);

    expect(mockReelBatchCreate).toHaveBeenCalledOnce();
    expect(mockReelJobCreate).toHaveBeenCalledTimes(2); // bases only

    // Bases get the FIRST alphabetical FORK_FREE value. cellKey sorts by
    // dim name: `endCard.platform` < `language`, so cells are
    // "fb|pl" / "fb|en" (platform value first, language value second).
    const cellKeys = mockReelJobCreate.mock.calls.map(
      (c) => (c[0] as { data: { batchCellKey: string } }).data.batchCellKey
    );
    expect(cellKeys.sort()).toEqual(['fb|en', 'fb|pl']);
  });

  it('base job inherits the base config + applies the cell s dimension values', async () => {
    await createMatrix({
      userId: 'user-1',
      base: {
        mode: 'n8n-explainer',
        workflowUrl: 'https://x',
        endCard: { durationSeconds: 4, headline: 'Hi' },
      },
      dimensions: {
        language: ['pl'],
        'endCard.platform': ['ig', 'fb'],
      },
    });

    expect(mockReelJobCreate).toHaveBeenCalledTimes(1);
    const baseJob = (
      mockReelJobCreate.mock.calls[0]![0] as {
        data: { reelConfig: Record<string, unknown>; batchRole: string };
      }
    ).data;

    expect(baseJob.batchRole).toBe('base');
    expect(baseJob.reelConfig).toMatchObject({
      mode: 'n8n-explainer',
      workflowUrl: 'https://x',
      language: 'pl', // BASE dim merged in
      endCard: {
        durationSeconds: 4, // preserved from base
        headline: 'Hi', // preserved
        platform: 'fb', // FORK_FREE dim's first alphabetical value
      },
    });
  });

  it('all base jobs share the same batchId (pointer to the new ReelBatch row)', async () => {
    await createMatrix({
      userId: 'user-1',
      base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
      dimensions: { language: ['pl', 'en'], 'endCard.platform': ['ig'] },
    });

    const batchIds = mockReelJobCreate.mock.calls.map(
      (c) => (c[0] as { data: { batchId: string } }).data.batchId
    );
    expect(new Set(batchIds).size).toBe(1);
    expect(batchIds[0]).toBe('batch-1');
  });

  it('enqueues each base job onto the reel-render queue', async () => {
    await createMatrix({
      userId: 'user-1',
      base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
      dimensions: { language: ['pl', 'en'], 'endCard.platform': ['ig'] },
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.stringContaining('job-'),
      expect.objectContaining({ jobId: expect.any(String) }),
      'reel-render'
    );
  });

  it('returns the full job list with cellKey, role, and pending forks (jobId=null)', async () => {
    const result = await createMatrix({
      userId: 'user-1',
      base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
      dimensions: {
        language: ['pl'],
        'endCard.platform': ['ig', 'fb', 'tiktok'],
      },
    });

    expect(result.jobs).toHaveLength(3);
    const baseCells = result.jobs.filter((j) => j.role === 'base');
    expect(baseCells).toHaveLength(1);
    expect(baseCells[0]!.jobId).toBeTruthy();
    expect(baseCells[0]!.status).toBe('queued');

    const forkCells = result.jobs.filter((j) => j.role === 'fork');
    expect(forkCells).toHaveLength(2);
    forkCells.forEach((c) => {
      expect(c.jobId).toBeNull();
      expect(c.status).toBe('pending-base');
    });
  });

  it('estimates cost = baseJobs × full credit + forkJobs × 0', async () => {
    const result = await createMatrix({
      userId: 'user-1',
      base: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
      dimensions: {
        language: ['pl', 'en'],
        'endCard.platform': ['ig', 'fb', 'tiktok', 'youtube', 'linkedin', 'universal'],
      },
    });

    expect(result.estimatedCost.credits).toBe(2 * MATRIX_LIMITS.creditsPerBase);
    expect(result.estimatedCost.fullPipelines).toBe(2);
    expect(result.estimatedCost.freeForks).toBe(10);
  });
});

describe('createMatrix - dimensions-only as fork', () => {
  it('a matrix without BASE dims still creates one base + N forks', async () => {
    // No language → only 1 base for the whole batch.
    const result = await createMatrix({
      userId: 'user-1',
      base: { mode: 'n8n-explainer', workflowUrl: 'https://x', language: 'pl' },
      dimensions: { 'endCard.platform': ['ig', 'fb', 'tiktok'] },
    });

    expect(result.baseJobs).toBe(1);
    expect(result.forkJobs).toBe(2);
    expect(result.totalCells).toBe(3);
  });
});
