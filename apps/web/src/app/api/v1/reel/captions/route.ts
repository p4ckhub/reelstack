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
import { captionsReelSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * POST /api/v1/reel/captions
 *
 * @deprecated Use POST /api/v1/reel/generate with mode="captions" instead.
 *
 * Add captions to an existing video. Returns a job ID for polling.
 *
 * Two sub-modes (auto-detected):
 * - script:  TTS generates audio → Whisper transcribes → captions burned onto videoUrl
 * - cues:    Pre-computed subtitle cues burned directly (no TTS, no transcription)
 *
 * This endpoint is kept for backward compatibility. It will be removed in a future version.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 20, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = captionsReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
    const cost = await getCreditCost('video');
    const { consumed, source } = await consumeCredits(ctx.user.id, limits.creditsPerMonth, cost);
    if (!consumed) {
      return errorResponse(
        'QUOTA_EXCEEDED',
        'Monthly render limit reached and no tokens available. Upgrade or purchase tokens.',
        429
      );
    }

    const captionsMode = parsed.data.cues ? 'cues' : 'script';

    const job = await createReelJob({
      userId: ctx.user.id,
      script: parsed.data.script ?? '',
      reelConfig: {
        mode: 'captions',
        captionsMode,
        videoUrl: parsed.data.videoUrl,
        cues: parsed.data.cues,
        style: parsed.data.style,
        tts: parsed.data.tts,
        brandPreset: parsed.data.brandPreset,
      },
      apiKeyId: ctx.apiKeyId ?? undefined,
      creditCost: cost,
      callbackUrl: parsed.data.callbackUrl,
    });

    try {
      const queue = await createQueue();
      await queue.enqueue(job.id, { jobId: job.id }, 'reel-render');
    } catch {
      await updateReelJobStatus(job.id, { status: 'FAILED', error: 'Queue unavailable' }).catch(
        () => {}
      );
      return errorResponse('SERVICE_UNAVAILABLE', 'Reel render queue unavailable', 503);
    }

    return successResponse(
      {
        jobId: job.id,
        mode: 'captions',
        captionsMode,
        status: 'queued',
        creditSource: source,
        pollUrl: `/api/v1/reel/render/${job.id}`,
      },
      201
    );
  }
);
