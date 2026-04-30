import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { PipelineEngine } from '@reelstack/agent/pipeline';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/reel/render/:id/steps
 *
 * Return the real persisted step list for a job by reading
 * `jobs/{jobId}/context.json` from MinIO. Each entry in
 * `context.results` is a step that completed and persisted output —
 * exactly the set the resume API will accept as `fromStepId`.
 *
 * We don't reconstruct the full PipelineDefinition here (would require
 * loading the module + its buildPipeline, which has side effects in
 * Next.js API context). Listing actually-completed steps is enough for
 * the re-render UI; the worker rebuilds the real definition when the
 * resume job is dequeued.
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

    const engine = new PipelineEngine();
    const context = await engine.loadContext(id);
    if (!context) {
      // Pre-multi-step jobs (or jobs that crashed before persisting) — surface
      // the legacy single-step shape so the UI degrades gracefully.
      return successResponse([
        { id: 'orchestrate', name: 'Run Module', status: 'pending' as const },
      ]);
    }

    const steps = Object.keys(context.results).map((stepId) => ({
      id: stepId,
      name: stepId,
      status: 'completed' as const,
    }));

    return successResponse(steps);
  }
);

function extractJobId(pathname: string): string | undefined {
  const parts = pathname.split('/');
  const stepsIdx = parts.indexOf('steps');
  return stepsIdx > 0 ? parts[stepsIdx - 1] : undefined;
}
