import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob, getApiCallLog } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/reel/:id/audit/:callId
 *
 * Returns a full API call record — request headers, scrubbed request body,
 * response status + headers + body, timing. For audit and replay.
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const segments = req.nextUrl.pathname.split('/');
    const callId = segments[segments.length - 1];
    const id = segments[segments.length - 3];
    if (!id || !callId) {
      return errorResponse('VALIDATION_ERROR', 'Job ID and call ID required', 400);
    }

    const job = await getReelJob(id, ctx.user.id);
    if (!job) return errorResponse('NOT_FOUND', 'Reel job not found', 404);

    const call = await getApiCallLog(id, callId);
    if (!call) return errorResponse('NOT_FOUND', 'API call not found', 404);

    return successResponse({ call });
  }
);
