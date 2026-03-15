import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { PipelineEngine } from '@reelstack/agent/pipeline';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';
import { resolvePipelineDefinition } from '@/lib/api/v1/pipeline-helpers';

/**
 * GET /api/v1/reel/render/:id/steps
 *
 * Get pipeline step statuses for a job.
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractJobId(new URL(req.url).pathname);
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);
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

    const engine = new PipelineEngine();
    const steps = await engine.getStatus(definition, id);

    return successResponse(steps);
  }
);

function extractJobId(pathname: string): string | undefined {
  const parts = pathname.split('/');
  const stepsIdx = parts.indexOf('steps');
  return stepsIdx > 0 ? parts[stepsIdx - 1] : undefined;
}
