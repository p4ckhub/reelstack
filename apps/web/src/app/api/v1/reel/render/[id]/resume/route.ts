import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { forkReelJob, FORK_OVERRIDABLE_KEYS } from '@reelstack/database';
import { copyJobContext, createStorage } from '@reelstack/storage';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('reel-resume');

/**
 * POST /api/v1/reel/render/:id/resume
 *
 * Re-render a completed reel from a chosen pipeline step, optionally
 * applying `configOverrides` (deep-merged into reelConfig). Implemented
 * as a fork: a child ReelJob is created with `sourceJobId` pointing at
 * the original, the source's MinIO context is copied to the child path,
 * and the child is enqueued. The original reel is untouched, so callers
 * can render N platform variants from a single full pipeline run.
 *
 * Body:
 *   {
 *     "fromStepId": "assemble-props",
 *     "configOverrides": { "endCard": { "platform": "fb" } }   // optional
 *   }
 *
 * Returns 202 with `{ jobId: childId, sourceJobId, fromStepId, status }`.
 *
 * `configOverrides` keys are restricted to `FORK_OVERRIDABLE_KEYS` —
 * anything else (workflowUrl, language, mode, …) would invalidate the
 * cached pipeline outputs, so callers must create a fresh job for those.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractJobId(new URL(req.url).pathname);
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);
    }

    const body = (await req.json().catch(() => null)) as {
      fromStepId?: unknown;
      configOverrides?: unknown;
    } | null;
    if (!body || typeof body.fromStepId !== 'string' || body.fromStepId.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'fromStepId is required in request body', 400);
    }

    const configOverrides =
      body.configOverrides && typeof body.configOverrides === 'object'
        ? (body.configOverrides as Record<string, unknown>)
        : {};

    const offendingKeys = Object.keys(configOverrides).filter(
      (k) => !(FORK_OVERRIDABLE_KEYS as readonly string[]).includes(k)
    );
    if (offendingKeys.length > 0) {
      return errorResponse(
        'VALIDATION_ERROR',
        `Cannot override keys [${offendingKeys.join(', ')}] via resume — would invalidate cached pipeline. Allowed: ${FORK_OVERRIDABLE_KEYS.join(', ')}. Submit a fresh /generate request instead.`,
        400
      );
    }

    let child;
    try {
      child = await forkReelJob({
        sourceJobId: id,
        userId: ctx.user.id,
        configOverrides,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fork job';
      // forkReelJob throws "not found" both for missing jobs and ownership
      // mismatches, which we map to 404 to avoid leaking job IDs.
      if (/not found/i.test(msg)) {
        return errorResponse('NOT_FOUND', msg, 404);
      }
      if (/COMPLETED|reelConfig|override/i.test(msg)) {
        return errorResponse('VALIDATION_ERROR', msg, 400);
      }
      log.error({ sourceJobId: id, err }, 'Fork failed');
      return errorResponse('INTERNAL_ERROR', 'Failed to fork reel job', 500);
    }

    try {
      const storage = await createStorage();
      await copyJobContext({
        sourceJobId: id,
        targetJobId: child.id,
        storage,
        contextOverrides: configOverrides,
      });
    } catch (err) {
      log.error({ sourceJobId: id, childId: child.id, err }, 'Context copy failed');
      return errorResponse('INTERNAL_ERROR', 'Failed to copy pipeline context', 500);
    }

    try {
      const queue = await createQueue();
      await queue.enqueue(
        child.id,
        { jobId: child.id, fromStepId: body.fromStepId },
        'reel-render'
      );
    } catch (err) {
      log.error({ childId: child.id, err }, 'Enqueue failed');
      return errorResponse('SERVICE_UNAVAILABLE', 'Reel render queue unavailable', 503);
    }

    return successResponse(
      {
        jobId: child.id,
        sourceJobId: id,
        fromStepId: body.fromStepId,
        status: 'queued' as const,
      },
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
