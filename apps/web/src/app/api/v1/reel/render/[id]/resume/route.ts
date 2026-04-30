import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * POST /api/v1/reel/render/:id/resume
 *
 * Resume pipeline from a specific step. Enqueues a resume job in BullMQ.
 * Body: { fromStepId: string }
 * Returns 202 Accepted.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractJobId(new URL(req.url).pathname);
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.fromStepId !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'fromStepId is required in request body', 400);
    }

    const job = await getReelJob(id, ctx.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Reel job not found', 404);
    }

    // BullMQ dedupes by job key — re-using the original `id` here would be
    // silently dropped because the original job is still in the completed/
    // failed retention window. Suffix with a fresh timestamp so each resume
    // is its own queue entry; the worker still reads `data.jobId` to load
    // the underlying reel job + persisted pipeline context.
    const queue = await createQueue();
    const queueJobId = `${id}-resume-${Date.now()}`;
    await queue.enqueue(queueJobId, { jobId: id, fromStepId: body.fromStepId }, 'reel-render');

    return successResponse(
      { jobId: id, queueJobId, fromStepId: body.fromStepId, status: 'resuming' },
      202
    );
  }
);

function extractJobId(pathname: string): string | undefined {
  // pathname: /api/v1/reel/render/{id}/resume
  const parts = pathname.split('/');
  const resumeIdx = parts.indexOf('resume');
  return resumeIdx > 0 ? parts[resumeIdx - 1] : undefined;
}
