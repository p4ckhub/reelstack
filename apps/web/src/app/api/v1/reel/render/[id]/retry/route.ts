import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';
import { resolvePipelineDefinition } from '@/lib/api/v1/pipeline-helpers';

/**
 * POST /api/v1/reel/render/:id/retry
 *
 * Retry a specific pipeline step.
 * Body: { stepId: string, modifiedInput?: Record<string, unknown> }
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractJobId(new URL(req.url).pathname);
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.stepId !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'stepId is required in request body', 400);
    }

    const job = await getReelJob(id, ctx.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Reel job not found', 404);
    }

    const config = (job.reelConfig as Record<string, unknown>) ?? {};
    const mode = (config.mode as string) ?? 'generate';

    const definition = resolvePipelineDefinition(mode);
    if (!definition) {
      return errorResponse('VALIDATION_ERROR', `No pipeline definition for mode: ${mode}`, 400);
    }

    const { PipelineEngine } = await import('@reelstack/agent/pipeline');
    const engine = new PipelineEngine();
    const stepStatus = await engine.retryStep(
      definition,
      id,
      body.stepId as string,
      body.modifiedInput as Record<string, unknown> | undefined
    );

    return successResponse(stepStatus);
  }
);

function extractJobId(pathname: string): string | undefined {
  // pathname: /api/v1/reel/render/{id}/retry
  const parts = pathname.split('/');
  const retryIdx = parts.indexOf('retry');
  return retryIdx > 0 ? parts[retryIdx - 1] : undefined;
}
