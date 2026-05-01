/**
 * `tryAdvanceMatrix(jobId)` is the worker hook called after each batch
 * job reaches a terminal status (COMPLETED or FAILED).
 *
 * Behavior:
 *   - On base COMPLETED: spawn forks for every cell sharing the base's
 *     BASE-dim values (e.g. same language). Each fork uses
 *     `forkReelJob` + `copyJobContext` from the base.
 *   - On base FAILED: skip fork spawning; the cells remain pending; if
 *     this was the last unresolved base, batch transitions to FAILED.
 *   - On fork COMPLETED/FAILED: just recompute the batch aggregate
 *     status. No further spawning needed (forks don't spawn forks).
 *   - Idempotent: calling twice for the same job is a no-op (forks
 *     already exist for that base).
 *
 * Status aggregation:
 *   - All COMPLETED → COMPLETED
 *   - All terminal, mix of COMPLETED+FAILED → PARTIAL
 *   - All FAILED → FAILED
 *   - Anything still QUEUED/PROCESSING → RUNNING
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReelJobFindUnique = vi.fn();
const mockReelJobFindMany = vi.fn();
const mockReelJobUpdate = vi.fn();
const mockReelBatchFindUnique = vi.fn();
const mockReelBatchUpdate = vi.fn();
const mockForkReelJob = vi.fn();
const mockCopyJobContext = vi.fn();
const mockEnqueue = vi.fn();
const mockCreateStorage = vi.fn();

vi.mock('@reelstack/database', () => ({
  prisma: {
    reelJob: {
      findUnique: (...a: unknown[]) => mockReelJobFindUnique(...a),
      findMany: (...a: unknown[]) => mockReelJobFindMany(...a),
      update: (...a: unknown[]) => mockReelJobUpdate(...a),
    },
    reelBatch: {
      findUnique: (...a: unknown[]) => mockReelBatchFindUnique(...a),
      update: (...a: unknown[]) => mockReelBatchUpdate(...a),
    },
  },
  forkReelJob: (...a: unknown[]) => mockForkReelJob(...a),
}));

vi.mock('@reelstack/storage', () => ({
  createStorage: (...a: unknown[]) => mockCreateStorage(...a),
  copyJobContext: (...a: unknown[]) => mockCopyJobContext(...a),
}));

vi.mock('@reelstack/queue', () => ({
  createQueue: vi.fn().mockResolvedValue({
    enqueue: (...a: unknown[]) => mockEnqueue(...a),
  }),
}));

const { tryAdvanceMatrix } = await import('../matrix-advance');

const BATCH_INPUT = {
  id: 'batch-1',
  userId: 'user-1',
  mode: 'n8n-explainer',
  baseInput: { mode: 'n8n-explainer', workflowUrl: 'https://x' },
  dimensions: {
    language: ['pl', 'en'],
    'endCard.platform': ['fb', 'ig', 'tiktok'],
  },
  status: 'RUNNING',
  callbackUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateStorage.mockResolvedValue({});
  mockCopyJobContext.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue(undefined);
  mockForkReelJob.mockImplementation(({ sourceJobId, configOverrides }) =>
    Promise.resolve({
      id: `fork-${sourceJobId}-${JSON.stringify(configOverrides)}`,
      userId: 'user-1',
    })
  );
  mockReelBatchUpdate.mockResolvedValue(undefined);
  mockReelJobUpdate.mockResolvedValue(undefined);
});

describe('tryAdvanceMatrix - base COMPLETED spawns forks', () => {
  it('spawns one fork per remaining cell sharing the base s BASE-dim values', async () => {
    // Base = pl|fb (language=pl, platform=fb). Remaining pl cells: ig, tiktok.
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'COMPLETED',
      reelConfig: { language: 'pl', endCard: { platform: 'fb' } },
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    // No siblings yet.
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    // Expect 2 forks: ig|pl and tiktok|pl
    expect(mockForkReelJob).toHaveBeenCalledTimes(2);
    const overrideCalls = mockForkReelJob.mock.calls.map(
      (c) => (c[0] as { configOverrides: unknown }).configOverrides
    );
    expect(overrideCalls).toEqual(
      expect.arrayContaining([{ endCard: { platform: 'ig' } }, { endCard: { platform: 'tiktok' } }])
    );
    expect(mockCopyJobContext).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('does not spawn forks for cells in OTHER BASE-dim groups', async () => {
    // Base = pl|fb. Should NOT spawn EN forks; that's the EN base s job.
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'COMPLETED',
      reelConfig: { language: 'pl', endCard: { platform: 'fb' } },
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    const cells = mockForkReelJob.mock.calls
      .map(
        (c) => (c[0] as { configOverrides: { endCard?: { platform?: string } } }).configOverrides
      )
      .map((o) => o.endCard?.platform);
    // Only pl-language forks. EN forks come when EN base completes.
    expect(cells.sort()).toEqual(['ig', 'tiktok']);
  });

  it('idempotent: skips forks that already exist for this base', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'COMPLETED',
      reelConfig: { language: 'pl', endCard: { platform: 'fb' } },
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    // Forks already exist for ig|pl and tiktok|pl (e.g. previous call already advanced).
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
      { batchCellKey: 'ig|pl', status: 'PROCESSING', batchRole: 'fork' },
      { batchCellKey: 'tiktok|pl', status: 'COMPLETED', batchRole: 'fork' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockForkReelJob).not.toHaveBeenCalled();
  });
});

describe('tryAdvanceMatrix - base FAILED skips fork spawn', () => {
  it('does NOT spawn forks when the base failed', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'FAILED',
      reelConfig: { language: 'pl', endCard: { platform: 'fb' } },
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'FAILED', batchRole: 'base' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockForkReelJob).not.toHaveBeenCalled();
  });
});

describe('tryAdvanceMatrix - batch status aggregation', () => {
  it('all jobs COMPLETED → batch.status = COMPLETED', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'fork',
      batchCellKey: 'tiktok|pl',
      status: 'COMPLETED',
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
      { batchCellKey: 'ig|pl', status: 'COMPLETED', batchRole: 'fork' },
      { batchCellKey: 'tiktok|pl', status: 'COMPLETED', batchRole: 'fork' },
      { batchCellKey: 'fb|en', status: 'COMPLETED', batchRole: 'base' },
      { batchCellKey: 'ig|en', status: 'COMPLETED', batchRole: 'fork' },
      { batchCellKey: 'tiktok|en', status: 'COMPLETED', batchRole: 'fork' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockReelBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );
  });

  it('mix of COMPLETED + FAILED, all terminal → PARTIAL', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'fork',
      batchCellKey: 'tiktok|pl',
      status: 'FAILED',
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
      { batchCellKey: 'ig|pl', status: 'COMPLETED', batchRole: 'fork' },
      { batchCellKey: 'tiktok|pl', status: 'FAILED', batchRole: 'fork' },
      { batchCellKey: 'fb|en', status: 'COMPLETED', batchRole: 'base' },
      { batchCellKey: 'ig|en', status: 'COMPLETED', batchRole: 'fork' },
      { batchCellKey: 'tiktok|en', status: 'COMPLETED', batchRole: 'fork' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockReelBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PARTIAL' }) })
    );
  });

  it('all jobs FAILED → FAILED', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'FAILED',
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    // Both bases failed — no forks ever spawned, both bases at terminal.
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'FAILED', batchRole: 'base' },
      { batchCellKey: 'fb|en', status: 'FAILED', batchRole: 'base' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockReelBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('any QUEUED/PROCESSING job → RUNNING (do not finalize batch yet)', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'COMPLETED',
    });
    mockReelBatchFindUnique.mockResolvedValue(BATCH_INPUT);
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
      { batchCellKey: 'ig|pl', status: 'QUEUED', batchRole: 'fork' },
      { batchCellKey: 'fb|en', status: 'PROCESSING', batchRole: 'base' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockReelBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) })
    );
  });
});

describe('tryAdvanceMatrix - guards', () => {
  it('no-op when job has no batchId', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-1',
      batchId: null,
      status: 'COMPLETED',
    });

    await tryAdvanceMatrix('job-1');

    expect(mockForkReelJob).not.toHaveBeenCalled();
    expect(mockReelBatchUpdate).not.toHaveBeenCalled();
  });

  it('no-op when job not in terminal status', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-1',
      batchId: 'batch-1',
      batchRole: 'base',
      status: 'PROCESSING',
    });

    await tryAdvanceMatrix('job-1');

    expect(mockForkReelJob).not.toHaveBeenCalled();
    expect(mockReelBatchUpdate).not.toHaveBeenCalled();
  });

  it('no-op when batch is CANCELLED (do not resurrect cancelled batches)', async () => {
    mockReelJobFindUnique.mockResolvedValue({
      id: 'job-pl-fb',
      batchId: 'batch-1',
      batchRole: 'base',
      batchCellKey: 'fb|pl',
      status: 'COMPLETED',
      reelConfig: { language: 'pl', endCard: { platform: 'fb' } },
    });
    mockReelBatchFindUnique.mockResolvedValue({ ...BATCH_INPUT, status: 'CANCELLED' });
    mockReelJobFindMany.mockResolvedValue([
      { batchCellKey: 'fb|pl', status: 'COMPLETED', batchRole: 'base' },
    ]);

    await tryAdvanceMatrix('job-pl-fb');

    expect(mockForkReelJob).not.toHaveBeenCalled();
    expect(mockReelBatchUpdate).not.toHaveBeenCalled();
  });
});
