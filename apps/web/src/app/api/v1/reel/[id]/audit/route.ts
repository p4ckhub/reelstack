import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob, listApiCallLogs } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/reel/:id/audit
 *
 * List every outbound HTTP request captured during the reel job.
 * Returns metadata only (method, URL, provider, status, timing) — fetch
 * a single call via `/audit/:callId` to see full request + response.
 *
 * Query params:
 *   limit: number (default 50, max 200)
 *   cursor: string (id of last item from previous page — for pagination)
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const segments = req.nextUrl.pathname.split('/');
    const id = segments[segments.length - 2];
    if (!id) return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);

    const job = await getReelJob(id, ctx.user.id);
    if (!job) return errorResponse('NOT_FOUND', 'Reel job not found', 404);

    const limitParam = req.nextUrl.searchParams.get('limit');
    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const calls = await listApiCallLogs({ jobId: id, limit, cursor });
    const nextCursor = calls.length === limit ? calls[calls.length - 1].id : null;

    return successResponse({ jobId: id, calls, nextCursor });
  }
);
