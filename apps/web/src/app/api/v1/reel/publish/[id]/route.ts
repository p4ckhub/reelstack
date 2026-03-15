import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/reel/publish/:id
 *
 * Check publish status for a reel.
 */
export const GET = withAuth(
  { scope: API_SCOPES.PUBLISH_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = req.nextUrl.pathname.split('/').pop();
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Reel ID required', 400);
    }

    const job = await getReelJob(id, ctx.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Reel job not found', 404);
    }

    return successResponse({
      reelId: job.id,
      publishStatus: job.publishStatus ?? null,
    });
  },
);
