/**
 * POST /api/v1/reel/matrix
 *
 * Render N variants of the same base reel across one or more
 * dimensions. The orchestrator splits dimensions into BASE (cache-
 * invalidating, full pipeline per value, paid) and FORK_FREE (zero-cost
 * re-renders from `assemble-props`) — see `@reelstack/agent`'s
 * `BASE_DIMENSIONS` / `FORK_FREE_DIMENSIONS` constants.
 *
 * Returns 202 with a batchId + per-cell summary. Bases enqueue
 * immediately; forks materialize when their base completes (worker
 * hook `tryAdvanceMatrix`).
 *
 * Body shape: see `matrixReelSchema` in lib/api/v1/reel-schemas.ts.
 *
 * To poll: GET /api/v1/reel/matrix/{batchId}
 */
import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { createMatrix } from '@reelstack/agent';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { matrixReelSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('reel-matrix');

export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 5, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = matrixReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
        400
      );
    }

    try {
      const result = await createMatrix({
        userId: ctx.user.id,
        apiKeyId: ctx.apiKeyId ?? undefined,
        base: parsed.data.base,
        dimensions: parsed.data.dimensions,
        callbackUrl: parsed.data.callbackUrl,
      });

      log.info(
        {
          batchId: result.batchId,
          totalCells: result.totalCells,
          baseJobs: result.baseJobs,
          forkJobs: result.forkJobs,
          userId: ctx.user.id,
        },
        'Matrix batch created'
      );

      return successResponse(result, 202);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create matrix';
      // createMatrix throws Error for validation issues with descriptive
      // messages — surface them to the caller as 400 so the integrator
      // can fix the request without reading server logs.
      if (/dimension|maxCells|maxBaseJobs|at least one value/i.test(msg)) {
        return errorResponse('VALIDATION_ERROR', msg, 400);
      }
      log.error({ userId: ctx.user.id, err }, 'Matrix creation failed');
      return errorResponse('INTERNAL_ERROR', 'Failed to create matrix', 500);
    }
  }
);
