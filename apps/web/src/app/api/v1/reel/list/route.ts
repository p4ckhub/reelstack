import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJobsByUser } from '@reelstack/database';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/reel/list - List user's reel jobs */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const reels = await getReelJobsByUser(ctx.user.id);
    return successResponse(
      reels.map((r) => ({
        id: r.id,
        status: r.status,
        progress: r.progress,
        script: r.script,
        outputUrl: r.outputUrl,
        error: r.error,
        createdAt: r.createdAt,
      }))
    );
  }
);
