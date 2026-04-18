import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import {
  createReelJob,
  consumeCredits,
  getModuleBySlug,
  canUserAccessModule,
  isUnlimited,
  shouldShowWatermarkForRender,
  updateReelJobStatus,
} from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { generateReelSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * POST /api/v1/reel/generate
 *
 * Generate a new video reel. Returns a job ID for polling.
 *
 * Two modes (auto-detected from request body):
 * - Full auto: script only — AI discovers tools, plans shots, generates assets
 * - Compose:   script + assets[] — AI arranges user-provided materials
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 10, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = generateReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    // Use explicit mode from schema (defaults to 'generate').
    // Backward compat: if assets provided but mode not explicitly set, treat as compose.
    const mode =
      parsed.data.mode === 'generate' && parsed.data.assets ? 'compose' : parsed.data.mode;

    // Module catalog is the source of truth for both access and pricing.
    // Owner users bypass both.
    const allowed = await canUserAccessModule({ id: ctx.user.id, tier: ctx.user.tier }, mode);
    if (!allowed) {
      return errorResponse(
        'FORBIDDEN',
        `Your plan doesn't include the "${mode}" module. Upgrade or purchase it to unlock.`,
        403
      );
    }

    // Load per-module credit cost. Fall back to a sensible default if the
    // catalog hasn't been seeded (e.g. first boot before `seed-modules.ts`).
    const mod = await getModuleBySlug(mode);
    const cost = mod?.creditCost ?? 10;

    let source: 'tier' | 'token' | 'owner' | null = 'owner';
    if (!isUnlimited(ctx.user)) {
      const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
      const result = await consumeCredits(ctx.user.id, limits.creditsPerMonth, cost);
      if (!result.consumed) {
        return errorResponse(
          'QUOTA_EXCEEDED',
          'Monthly render limit reached and no tokens available. Upgrade or purchase tokens.',
          429
        );
      }
      source = result.source;
    }

    // FREE-tier watermark flag + seed. Server-side only — clients cannot set either.
    // Decision is PER-RENDER: FREE user using monthly allowance → watermark on,
    // FREE user burning purchased tokens → clean (they paid for this render),
    // paid tiers + OWNER → clean always. See shouldShowWatermarkForRender().
    // Random seed keeps watermark positions stable across re-renders of the same job.
    const watermarkConfig = {
      enabled: shouldShowWatermarkForRender(ctx.user, source),
      seed: crypto.randomUUID(),
    };

    const job = await createReelJob({
      userId: ctx.user.id,
      script: parsed.data.script,
      reelConfig: {
        mode,
        layout: parsed.data.layout,
        // Authoritative: whatever the client sent, server overrides.
        watermark: watermarkConfig,
        style: parsed.data.style,
        tts: parsed.data.tts,
        whisper: parsed.data.whisper,
        brandPreset: parsed.data.brandPreset,
        assets: parsed.data.assets,
        directorNotes: parsed.data.directorNotes,
        avatar: parsed.data.avatar,
        workflowUrl: parsed.data.workflowUrl,
        endCard: parsed.data.endCard,
        scrollStopper: parsed.data.scrollStopper,
        topic: parsed.data.topic,
        language: parsed.data.language,
        persona: parsed.data.persona,
        avatarVideoUrl: parsed.data.avatarVideoUrl,
        avatarLoop: parsed.data.avatarLoop,
        avatarClipDurationSeconds: parsed.data.avatarClipDurationSeconds,
        numberOfTips: parsed.data.numberOfTips,
        variant: parsed.data.variant,
        montageProfile: parsed.data.montageProfile,
        preferredToolIds: parsed.data.preferredToolIds,
        // Captions-specific fields
        videoUrl: parsed.data.videoUrl,
        cues: parsed.data.cues,
        // Slideshow-specific fields
        slides: parsed.data.slides,
        brand: parsed.data.brand,
        template: parsed.data.template,
        numberOfSlides: parsed.data.numberOfSlides,
        musicUrl: parsed.data.musicUrl,
        musicVolume: parsed.data.musicVolume,
        highlightMode: parsed.data.highlightMode,
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
        mode,
        status: 'queued',
        creditSource: source,
        pollUrl: `/api/v1/reel/render/${job.id}`,
      },
      201
    );
  }
);
