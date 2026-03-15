import { NextRequest, NextResponse } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { createStorage } from '@reelstack/storage';
import { withAuth, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/reel/render/:id/download
 *
 * Download rendered MP4 file.
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (req: NextRequest, ctx: AuthContext) => {
    const parts = req.nextUrl.pathname.split('/');
    const id = parts[parts.length - 2];
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Job ID required', 400);
    }

    const job = await getReelJob(id, ctx.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Reel job not found', 404);
    }
    if (job.status !== 'COMPLETED') {
      return errorResponse('VALIDATION_ERROR', 'Reel not ready', 400);
    }

    const storage = await createStorage();
    const key = `reels/${id}/output.mp4`;
    const buffer = await storage.download(key);

    const response = new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="reel-${id.slice(0, 8)}.mp4"`,
        'Content-Length': String(buffer.length),
      },
    });
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  },
);
