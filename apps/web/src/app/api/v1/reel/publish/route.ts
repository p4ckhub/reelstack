import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getReelJob } from '@reelstack/database';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { publishReelSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * POST /api/v1/reel/publish
 *
 * Publish a rendered reel to social media platforms via Postiz.
 */
export const POST = withAuth(
  { scope: API_SCOPES.PUBLISH_WRITE, rateLimit: { maxRequests: 10, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = publishReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    // Verify reel exists and is completed
    const job = await getReelJob(parsed.data.reelId, ctx.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Reel job not found', 404);
    }
    if (job.status !== 'COMPLETED') {
      return errorResponse('VALIDATION_ERROR', 'Reel must be rendered before publishing', 400);
    }
    if (!job.outputUrl) {
      return errorResponse('VALIDATION_ERROR', 'Reel has no output URL', 400);
    }

    // Enqueue publish job
    try {
      const queue = await createQueue();
      await Promise.race([
        queue.enqueue(
          job.id,
          {
            jobId: job.id,
            platforms: parsed.data.platforms,
            caption: parsed.data.caption,
            hashtags: parsed.data.hashtags,
            scheduleDate: parsed.data.scheduleDate,
          },
          'reel-publish'
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Queue timeout')), 15_000)),
      ]);
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 'Publish queue unavailable', 503);
    }

    return successResponse(
      {
        reelId: job.id,
        platforms: parsed.data.platforms,
        status: 'queued',
        pollUrl: `/api/v1/reel/publish/${job.id}`,
      },
      201
    );
  }
);
