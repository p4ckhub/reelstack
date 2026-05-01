/**
 * GET    /api/v1/reel/matrix/{batchId}    — status snapshot
 * DELETE /api/v1/reel/matrix/{batchId}    — cancel pending bases + forks
 *
 * Status snapshot aggregates over child ReelJobs:
 *   queued / running / completed / partial / failed / cancelled
 *
 * `outputs` is a cellKey → outputUrl map for completed cells, so
 * integrators can stitch the matrix straight from the response.
 */
import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { prisma } from '@reelstack/database';
import { expandDimensions } from '@reelstack/agent';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

function extractBatchId(pathname: string): string | undefined {
  const parts = pathname.split('/');
  const idx = parts.indexOf('matrix');
  return idx > 0 ? parts[idx + 1] : undefined;
}

export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractBatchId(new URL(req.url).pathname);
    if (!id) return errorResponse('VALIDATION_ERROR', 'Batch ID required', 400);

    const batch = await prisma.reelBatch.findFirst({
      where: { id, userId: ctx.user.id },
      include: {
        jobs: {
          select: {
            id: true,
            status: true,
            outputUrl: true,
            error: true,
            batchRole: true,
            batchCellKey: true,
          },
        },
      },
    });
    if (!batch) return errorResponse('NOT_FOUND', 'Matrix batch not found', 404);

    // totalCells = expected size of the matrix (including forks not yet
    // spawned). batch.jobs only contains rows that have already been
    // created — bases first, forks later when each base completes.
    const expectedCells = expandDimensions(batch.dimensions as Record<string, readonly string[]>);
    const totalCells = expectedCells.length;

    const completed = batch.jobs.filter((j) => j.status === 'COMPLETED').length;
    const failed = batch.jobs.filter((j) => j.status === 'FAILED').length;

    const outputs: Record<string, string> = {};
    const jobsByKey = new Map(batch.jobs.map((j) => [j.batchCellKey, j]));
    const jobs = expectedCells.map((cell) => {
      // Compute the cell key the same way createMatrix did: pipe-joined
      // values in dim-key sort order.
      const key = Object.keys(cell)
        .sort()
        .map((k) => cell[k])
        .join('|');
      const j = jobsByKey.get(key);
      if (j?.status === 'COMPLETED' && j.outputUrl) outputs[key] = j.outputUrl;
      return {
        cellKey: key,
        dimensions: cell,
        role: j?.batchRole ?? 'fork',
        jobId: j?.id ?? null,
        status: j ? j.status.toLowerCase() : 'pending-base',
        outputUrl: j?.outputUrl ?? null,
        error: j?.error ?? null,
      };
    });

    // Aggregate status: trust the live job counts over the persisted
    // batch.status field (the worker hook only updates on terminal
    // events; this gives accurate "running" while jobs are processing).
    let aggregateStatus: string;
    if (batch.status === 'CANCELLED') {
      aggregateStatus = 'cancelled';
    } else if (batch.jobs.length === 0) {
      aggregateStatus = 'queued';
    } else if (batch.jobs.some((j) => j.status === 'PROCESSING' || j.status === 'QUEUED')) {
      aggregateStatus = 'running';
    } else if (failed === 0) {
      aggregateStatus = completed === totalCells ? 'completed' : 'running';
    } else if (completed > 0) {
      aggregateStatus = 'partial';
    } else {
      aggregateStatus = 'failed';
    }

    return successResponse({
      batchId: batch.id,
      mode: batch.mode,
      status: aggregateStatus,
      totalCells,
      completed,
      failed,
      dimensions: batch.dimensions,
      jobs,
      outputs,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    });
  }
);

export const DELETE = withAuth(
  { scope: API_SCOPES.REEL_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractBatchId(new URL(req.url).pathname);
    if (!id) return errorResponse('VALIDATION_ERROR', 'Batch ID required', 400);

    const batch = await prisma.reelBatch.findFirst({
      where: { id, userId: ctx.user.id },
      include: { jobs: { select: { id: true, status: true } } },
    });
    if (!batch) return errorResponse('NOT_FOUND', 'Matrix batch not found', 404);

    // Idempotent: already-cancelled stays cancelled.
    if (batch.status === 'CANCELLED') {
      return successResponse({ batchId: batch.id, status: 'cancelled', cancelledJobs: 0 });
    }

    // Mark batch CANCELLED first so the worker hook (`tryAdvanceMatrix`)
    // bails out on subsequent terminal events without spawning forks.
    await prisma.reelBatch.update({ where: { id: batch.id }, data: { status: 'CANCELLED' } });

    // Mark all not-yet-terminal child jobs FAILED with a clear error.
    // Jobs already running are not pre-empted (BullMQ doesn't support
    // mid-step interrupt cleanly); they'll finish then noop on advance
    // because batch is CANCELLED.
    const cancellable = batch.jobs.filter((j) => j.status === 'QUEUED');
    for (const j of cancellable) {
      await prisma.reelJob.update({
        where: { id: j.id },
        data: { status: 'FAILED', error: 'Cancelled via batch DELETE' },
      });
    }

    return successResponse({
      batchId: batch.id,
      status: 'cancelled',
      cancelledJobs: cancellable.length,
    });
  }
);
