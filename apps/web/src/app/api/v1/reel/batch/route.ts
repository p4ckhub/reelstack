import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import {
  createReelJob,
  consumeCredits,
  getCreditCost,
  updateReelJobStatus,
} from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { batchGenerateSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';
import { randomUUID } from 'crypto';

/**
 * POST /api/v1/reel/batch
 *
 * Generate up to 20 reels in a single request (same options as /generate).
 * Each reel consumes one render credit. Partial success is possible:
 * if credits run out mid-batch, already-queued jobs proceed.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 2, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = batchGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
    const cost = await getCreditCost('video');
    const batchId = randomUUID();
    const results: Array<
      | { index: number; jobId: string; mode: string; status: 'queued' }
      | { index: number; error: string }
    > = [];

    let queue: Awaited<ReturnType<typeof createQueue>> | null = null;
    try {
      queue = await createQueue();
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 'Reel render queue unavailable', 503);
    }

    for (let i = 0; i < parsed.data.reels.length; i++) {
      const reel = parsed.data.reels[i];

      const { consumed } = await consumeCredits(ctx.user.id, limits.creditsPerMonth, cost);
      if (!consumed) {
        results.push({ index: i, error: 'Quota exceeded - no credits remaining' });
        continue;
      }

      // Use explicit mode from schema. Backward compat: assets without mode = compose.
      const mode = reel.mode === 'generate' && reel.assets ? 'compose' : reel.mode;

      const job = await createReelJob({
        userId: ctx.user.id,
        script: reel.script,
        reelConfig: {
          mode,
          layout: reel.layout,
          style: reel.style,
          tts: reel.tts,
          whisper: reel.whisper,
          brandPreset: reel.brandPreset,
          assets: reel.assets,
          directorNotes: reel.directorNotes,
          avatar: reel.avatar,
          workflowUrl: reel.workflowUrl,
          topic: reel.topic,
          language: reel.language,
          persona: reel.persona,
          numberOfTips: reel.numberOfTips,
          variant: reel.variant,
          montageProfile: reel.montageProfile,
        },
        apiKeyId: ctx.apiKeyId ?? undefined,
        creditCost: cost,
        callbackUrl: reel.callbackUrl ?? parsed.data.callbackUrl,
        parentJobId: batchId,
      });

      try {
        await queue.enqueue(job.id, { jobId: job.id }, 'reel-render');
        results.push({ index: i, jobId: job.id, mode, status: 'queued' });
      } catch {
        await updateReelJobStatus(job.id, { status: 'FAILED', error: 'Queue unavailable' }).catch(
          () => {}
        );
        results.push({ index: i, error: 'Queue unavailable' });
      }
    }

    const queued = results.filter((r) => 'jobId' in r).length;
    const failed = results.filter((r) => 'error' in r).length;

    return successResponse(
      {
        batchId,
        total: parsed.data.reels.length,
        queued,
        failed,
        jobs: results,
      },
      201
    );
  }
);
