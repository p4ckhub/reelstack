/**
 * Worker-side matrix advancement.
 *
 * Called by `processReelPipelineJob` after each batch job reaches a
 * terminal status (COMPLETED or FAILED). Responsibilities:
 *
 *   1. If the job is a `base` that COMPLETED: spawn forks for every
 *      remaining cell sharing the base's BASE-dim values (e.g. same
 *      language). Each fork uses `forkReelJob` (deep-merge configOverrides
 *      from the cell's FORK-dim values) + `copyJobContext` (clone MinIO
 *      pipeline context with overrides applied) + enqueue.
 *   2. If the job is a `base` that FAILED: skip fork spawning; the
 *      cells in that BASE-dim group remain pending forever.
 *   3. Recompute the batch's aggregate status and persist.
 *
 * Idempotent: if forks for the base already exist, the spawn step is
 * a no-op. CANCELLED batches are never resurrected.
 */
import { prisma, forkReelJob } from '@reelstack/database';
import { createStorage, copyJobContext } from '@reelstack/storage';
import { createQueue } from '@reelstack/queue';
import { createLogger } from '@reelstack/logger';
import { classifyDimensionKey, cellKey, expandDimensions, type Cell } from './matrix';

const log = createLogger('matrix-advance');

const FORK_FROM_STEP_ID = 'assemble-props';

interface JobRow {
  batchCellKey: string | null;
  status: string;
  batchRole: string | null;
}

/**
 * Returns just the BASE-dim slice of a cell (e.g. {language: 'pl'} from
 * {language: 'pl', 'endCard.platform': 'fb'}). Used to find sibling
 * cells that should share a base.
 */
function pickBaseDims(cell: Cell): Cell {
  const out: Cell = {};
  for (const [key, value] of Object.entries(cell)) {
    if (classifyDimensionKey(key) === 'base') out[key] = value;
  }
  return out;
}

/**
 * Returns the FORK-dim slice (everything not in BASE) — what we
 * override per fork.
 */
function pickForkOverrides(cell: Cell): Record<string, unknown> {
  // Build a nested overrides object using the dim-key dotted path.
  // E.g. cell {endCard.platform: 'fb'} → {endCard: {platform: 'fb'}}.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cell)) {
    if (classifyDimensionKey(key) !== 'fork') continue;
    const parts = key.split('.');
    if (parts.length === 1) {
      out[key] = value;
      continue;
    }
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]!;
      cursor[k] = (cursor[k] as Record<string, unknown> | undefined) ?? {};
      cursor = cursor[k] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;
  }
  return out;
}

function aggregateStatus(jobs: JobRow[]): 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' {
  if (jobs.length === 0) return 'RUNNING';
  const allTerminal = jobs.every((j) => j.status === 'COMPLETED' || j.status === 'FAILED');
  if (!allTerminal) return 'RUNNING';
  const anyCompleted = jobs.some((j) => j.status === 'COMPLETED');
  const anyFailed = jobs.some((j) => j.status === 'FAILED');
  if (anyCompleted && !anyFailed) return 'COMPLETED';
  if (anyCompleted && anyFailed) return 'PARTIAL';
  return 'FAILED';
}

export async function tryAdvanceMatrix(jobId: string): Promise<void> {
  const job = await prisma.reelJob.findUnique({ where: { id: jobId } });
  if (!job || !job.batchId) return;

  // Only act on terminal jobs — intermediate transitions can call this
  // hook freely without side effects.
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') return;

  const batch = await prisma.reelBatch.findUnique({ where: { id: job.batchId } });
  if (!batch) {
    log.warn({ jobId, batchId: job.batchId }, 'tryAdvanceMatrix: batch not found');
    return;
  }
  if (batch.status === 'CANCELLED') return;

  const dims = batch.dimensions as Record<string, readonly string[]>;

  // ── Step 1: spawn forks if this is a successful base ────────
  if (job.batchRole === 'base' && job.status === 'COMPLETED' && job.batchCellKey) {
    // Reconstruct the base cell from the cellKey + dim metadata.
    // cellKey was built by joining values in dim-key sort order, so we
    // can pair them back up with sorted dim keys.
    const sortedDimKeys = Object.keys(dims).sort();
    const cellValues = job.batchCellKey.split('|');
    if (cellValues.length !== sortedDimKeys.length) {
      log.warn(
        { jobId, batchCellKey: job.batchCellKey, sortedDimKeys },
        'tryAdvanceMatrix: cellKey arity mismatch, skipping fork spawn'
      );
    } else {
      const baseCell: Cell = {};
      sortedDimKeys.forEach((k, i) => {
        baseCell[k] = cellValues[i]!;
      });

      // Find sibling cells in the same BASE-dim group (e.g. same language).
      const baseDimsSlice = pickBaseDims(baseCell);
      const allCells = expandDimensions(dims);
      const groupCells = allCells.filter((c) =>
        Object.entries(baseDimsSlice).every(([k, v]) => c[k] === v)
      );

      // Skip cells that already have a job (idempotent).
      const existingJobs = await prisma.reelJob.findMany({
        where: { batchId: batch.id },
        select: { batchCellKey: true, status: true, batchRole: true },
      });
      const existingCellKeys = new Set(
        existingJobs.map((j) => j.batchCellKey).filter((k): k is string => !!k)
      );

      const cellsToFork = groupCells.filter((c) => !existingCellKeys.has(cellKey(c)));

      if (cellsToFork.length > 0) {
        const storage = await createStorage();
        const queue = await createQueue();
        for (const cell of cellsToFork) {
          const overrides = pickForkOverrides(cell);
          try {
            const child = await forkReelJob({
              sourceJobId: job.id,
              userId: job.userId,
              configOverrides: overrides,
            });
            await copyJobContext({
              sourceJobId: job.id,
              targetJobId: child.id,
              storage,
              contextOverrides: overrides,
            });
            // Annotate the child with batch metadata so subsequent
            // tryAdvanceMatrix calls + status aggregation find it.
            await prisma.reelJob.update({
              where: { id: child.id },
              data: {
                batchId: batch.id,
                batchRole: 'fork',
                batchCellKey: cellKey(cell),
                callbackUrl: batch.callbackUrl,
              },
            });
            await queue.enqueue(
              child.id,
              { jobId: child.id, fromStepId: FORK_FROM_STEP_ID },
              'reel-render'
            );
          } catch (err) {
            log.error({ batchId: batch.id, cell, err }, 'tryAdvanceMatrix: fork creation failed');
            // Continue with other cells — partial fork failures land in
            // the batch status (PARTIAL) rather than blocking everything.
          }
        }
      }
    }
  }

  // ── Step 2: recompute aggregate status ──────────────────────
  const allJobs = await prisma.reelJob.findMany({
    where: { batchId: batch.id },
    select: { batchCellKey: true, status: true, batchRole: true },
  });
  const newStatus = aggregateStatus(allJobs);
  if (newStatus !== batch.status) {
    await prisma.reelBatch.update({
      where: { id: batch.id },
      data: { status: newStatus },
    });
  } else {
    // Even when status doesn't change, persist updatedAt so listeners
    // can detect activity. Use a no-op update.
    await prisma.reelBatch.update({
      where: { id: batch.id },
      data: { status: newStatus },
    });
  }
}
