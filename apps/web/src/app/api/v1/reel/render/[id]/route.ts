import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/reel/render/:id
 *
 * Poll reel render job status.
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = req.nextUrl.pathname.split('/').pop();
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);
    }

    const job = await getReelJob(id, ctx.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Reel job not found', 404);
    }

    const status = job.status.toLowerCase() as 'queued' | 'processing' | 'completed' | 'failed';

    return successResponse({
      id: job.id,
      status,
      progress: job.progress,
      outputUrl: job.status === 'COMPLETED' ? job.outputUrl : null,
      downloadUrl: job.status === 'COMPLETED' ? `/api/v1/reel/render/${job.id}/download` : null,
      error: job.status === 'FAILED' ? job.error : null,
      publishStatus: job.publishStatus,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  }
);
