/**
 * Matrix-render orchestration. Powers `POST /api/v1/reel/matrix`.
 *
 * A "matrix" is a request to produce N variants of the same base reel
 * across one or more dimensions (e.g. language × endCard platform).
 * The orchestrator splits dimensions into two classes:
 *
 *   BASE — cache-invalidating: changing the value forces a full
 *          pipeline run (LLM + TTS + screenshot). Counts toward the
 *          paid credit cost. Only `language` qualifies today.
 *
 *   FORK_FREE — re-renderable from `assemble-props` for zero API cost
 *          (just CPU). The matrix runs ONE full pipeline per BASE
 *          combination, then the worker spawns forks for every
 *          remaining cell via `forkReelJob` + `copyJobContext`.
 *
 * Anything outside these classes (e.g. `tts.voice`, `mode`, `workflowUrl`)
 * is rejected — it would either invalidate the fork cache or change the
 * pipeline shape entirely. To run those variants, submit separate
 * `/generate` requests.
 */
import { prisma } from '@reelstack/database';
import { createQueue } from '@reelstack/queue';
import { createLogger } from '@reelstack/logger';

const log = createLogger('matrix');

// ── Allow-lists (single source of truth) ──────────────────────

/**
 * Dimension keys whose value changes invalidate ALL cached pipeline
 * outputs. Each value spawns a separate full pipeline run.
 */
export const BASE_DIMENSIONS = ['language'] as const;

/**
 * Dimension key roots that fork from `assemble-props` (zero API cost).
 * Aligned with `FORK_OVERRIDABLE_KEYS` in @reelstack/database, minus
 * `tts` (which forks from `tts-pipeline` and re-spends on the TTS
 * provider — explicit opt-in goes through a future `paid` channel).
 */
export const FORK_FREE_DIMENSIONS = [
  'endCard',
  'captionStyle',
  'brandPreset',
  'scrollStopper',
  'highlightMode',
] as const;

export const MATRIX_LIMITS = {
  /** Hard cap on cells per matrix — prevents accidental cost blowups. */
  maxCells: 20,
  /** Hard cap on full pipeline runs — costs ramp linearly here. */
  maxBaseJobs: 5,
  /** Per-base credit estimate; matches the default `creditCost` on
   *  ReelJob until the planner can compute exact cost upfront. */
  creditsPerBase: 10,
} as const;

// ── Classifier ────────────────────────────────────────────────

export type DimensionClass = 'base' | 'fork';

function rootKey(key: string): string {
  // `endCard.platform` → `endCard`
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}

export function classifyDimensionKey(key: string): DimensionClass | null {
  const root = rootKey(key);
  if ((BASE_DIMENSIONS as readonly string[]).includes(root)) return 'base';
  if ((FORK_FREE_DIMENSIONS as readonly string[]).includes(root)) return 'fork';
  return null;
}

// ── Cell expansion ────────────────────────────────────────────

export type Cell = Record<string, string>;

export function cellKey(cell: Cell): string {
  // Sort by dimension key so the same cell always produces the same
  // string regardless of insertion order.
  return Object.keys(cell)
    .sort()
    .map((k) => cell[k])
    .join('|');
}

export function expandDimensions(dimensions: Record<string, readonly string[]>): Cell[] {
  const keys = Object.keys(dimensions);
  if (keys.length === 0) return [{}];

  let cells: Cell[] = [{}];
  for (const key of keys) {
    const values = dimensions[key]!;
    const next: Cell[] = [];
    for (const cell of cells) {
      for (const v of values) {
        next.push({ ...cell, [key]: v });
      }
    }
    cells = next;
  }
  return cells;
}

// ── Reel-config merge (per-cell overrides) ────────────────────

function applyDimensionToConfig(
  config: Record<string, unknown>,
  dimKey: string,
  value: string
): Record<string, unknown> {
  const root = rootKey(dimKey);
  // Top-level dim (e.g. `language: 'pl'`)
  if (root === dimKey) {
    return { ...config, [dimKey]: value };
  }
  // Nested dim (e.g. `endCard.platform: 'fb'`)
  const path = dimKey.slice(root.length + 1).split('.');
  const out = { ...config };
  let nested = (out[root] as Record<string, unknown>) ?? {};
  nested = { ...nested };
  out[root] = nested;
  let cursor = nested;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    cursor[k] = { ...((cursor[k] as Record<string, unknown>) ?? {}) };
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]!] = value;
  return out;
}

function buildCellConfig(base: Record<string, unknown>, cell: Cell): Record<string, unknown> {
  let out = { ...base };
  for (const [key, value] of Object.entries(cell)) {
    out = applyDimensionToConfig(out, key, value);
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────

export interface CreateMatrixInput {
  userId: string;
  apiKeyId?: string;
  base: Record<string, unknown>;
  dimensions: Record<string, readonly string[]>;
  callbackUrl?: string;
}

export interface MatrixCellSummary {
  cellKey: string;
  dimensions: Cell;
  role: 'base' | 'fork';
  jobId: string | null;
  status: 'queued' | 'pending-base';
}

export interface CreateMatrixResult {
  batchId: string;
  totalCells: number;
  baseJobs: number;
  forkJobs: number;
  estimatedCost: {
    credits: number;
    fullPipelines: number;
    freeForks: number;
  };
  jobs: MatrixCellSummary[];
}

export async function createMatrix(input: CreateMatrixInput): Promise<CreateMatrixResult> {
  const dims = input.dimensions;
  const dimKeys = Object.keys(dims);

  // ── Validation ──────────────────────────────────────────────
  if (dimKeys.length === 0) {
    throw new Error(
      '`dimensions` map must include at least one entry. To render a single reel, use POST /api/v1/reel/generate.'
    );
  }

  const unknownKeys: string[] = [];
  for (const key of dimKeys) {
    if (classifyDimensionKey(key) === null) unknownKeys.push(key);
    if (!Array.isArray(dims[key]) || dims[key]!.length === 0) {
      throw new Error(`Dimension "${key}" must declare at least one value`);
    }
  }
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown dimension keys: [${unknownKeys.join(', ')}]. Allowed BASE: [${BASE_DIMENSIONS.join(', ')}]. Allowed FORK_FREE roots: [${FORK_FREE_DIMENSIONS.join(', ')}]. To render variants on cache-invalidating fields (mode, workflowUrl, tts.voice, ...), submit separate /generate requests.`
    );
  }

  // Split into base vs fork dims for cell key generation + base count.
  const baseDims: Record<string, readonly string[]> = {};
  const forkDims: Record<string, readonly string[]> = {};
  for (const key of dimKeys) {
    if (classifyDimensionKey(key) === 'base') baseDims[key] = dims[key]!;
    else forkDims[key] = dims[key]!;
  }

  const allCells = expandDimensions(dims);
  const baseCells = expandDimensions(baseDims);
  const totalCells = allCells.length;
  const baseJobs = baseCells.length;
  const forkJobs = totalCells - baseJobs;

  if (totalCells > MATRIX_LIMITS.maxCells) {
    throw new Error(
      `Matrix would render ${totalCells} cells, exceeds maxCells=${MATRIX_LIMITS.maxCells}. Reduce dimensions or split into multiple matrix requests.`
    );
  }
  if (baseJobs > MATRIX_LIMITS.maxBaseJobs) {
    throw new Error(
      `Matrix would run ${baseJobs} full pipelines, exceeds maxBaseJobs=${MATRIX_LIMITS.maxBaseJobs}. Each base costs API credits — reduce BASE dimensions (${BASE_DIMENSIONS.join(', ')}) or split into separate matrix requests.`
    );
  }

  // ── Pick base FORK_FREE values: first alphabetical per dim ──
  const baseForkValues: Record<string, string> = {};
  for (const [key, values] of Object.entries(forkDims)) {
    baseForkValues[key] = [...values].sort()[0]!;
  }

  // ── Persist batch + base jobs ───────────────────────────────
  const mode = (input.base.mode as string | undefined) ?? 'generate';

  const result = await prisma.$transaction(async (tx) => {
    const batch = await (tx as typeof prisma).reelBatch.create({
      data: {
        userId: input.userId,
        mode,
        baseInput: input.base as object,
        dimensions: dims as object,
        status: 'QUEUED',
        callbackUrl: input.callbackUrl,
      },
    });

    const baseJobRows: Array<{ id: string; cellKey: string; cell: Cell }> = [];

    for (const baseCell of baseCells) {
      const fullCell: Cell = { ...baseCell, ...baseForkValues };
      const reelConfig = buildCellConfig(input.base, fullCell);
      const key = cellKey(fullCell);
      const job = await (tx as typeof prisma).reelJob.create({
        data: {
          userId: input.userId,
          script: (input.base.script as string | undefined) ?? null,
          reelConfig: reelConfig as object,
          apiKeyId: input.apiKeyId,
          creditCost: MATRIX_LIMITS.creditsPerBase,
          callbackUrl: input.callbackUrl,
          language: (fullCell.language ?? input.base.language) as string | undefined,
          batchId: batch.id,
          batchRole: 'base',
          batchCellKey: key,
          status: 'QUEUED',
        },
      });
      baseJobRows.push({ id: job.id, cellKey: key, cell: fullCell });
    }

    return { batch, baseJobRows };
  });

  // ── Enqueue base jobs ───────────────────────────────────────
  const queue = await createQueue();
  for (const row of result.baseJobRows) {
    try {
      await queue.enqueue(row.id, { jobId: row.id }, 'reel-render');
    } catch (err) {
      log.error({ jobId: row.id, batchId: result.batch.id, err }, 'Failed to enqueue base job');
      throw err;
    }
  }

  // ── Build cell summary list ─────────────────────────────────
  const baseCellByKey = new Map(result.baseJobRows.map((r) => [r.cellKey, r.id]));
  const jobs: MatrixCellSummary[] = allCells.map((cell) => {
    const key = cellKey(cell);
    const baseJobId = baseCellByKey.get(key);
    if (baseJobId) {
      return {
        cellKey: key,
        dimensions: cell,
        role: 'base',
        jobId: baseJobId,
        status: 'queued',
      };
    }
    return {
      cellKey: key,
      dimensions: cell,
      role: 'fork',
      jobId: null,
      status: 'pending-base',
    };
  });

  return {
    batchId: result.batch.id,
    totalCells,
    baseJobs,
    forkJobs,
    estimatedCost: {
      credits: baseJobs * MATRIX_LIMITS.creditsPerBase,
      fullPipelines: baseJobs,
      freeForks: forkJobs,
    },
    jobs,
  };
}
