import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { API_SCOPES } from '@reelstack/types';
import { consumeCredits, getCreditCost } from '@reelstack/database';
import { withAuth, errorResponse } from '@/lib/api/v1/middleware';
import { getTierLimits } from '@/lib/api/validation';
import type { AuthContext } from '@/lib/api/v1/types';

const generateImageSchema = z.object({
  brand: z.string().min(1).max(64),
  template: z.string().min(1).max(64),
  size: z.string().min(1).max(16).default('post'),
  text: z.string().max(500).optional(),
  attr: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  badge: z.string().max(100).optional(),
  bullets: z.string().max(500).optional(),
  number: z.string().max(20).optional(),
  label: z.string().max(100).optional(),
  date: z.string().max(100).optional(),
  cta: z.string().max(200).optional(),
  num: z.string().max(20).optional(),
  urgency: z.string().max(200).optional(),
  bg_opacity: z.string().max(10).optional(),
});

/**
 * POST /api/v1/image/generate
 *
 * Generate a social media image from a brand + template.
 * Returns PNG (single size) or 501 for size=all (ZIP support planned).
 * Costs 1 credit per request.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 20, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = generateImageSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map(i => i.message).join(', '),
        400,
      );
    }

    if (parsed.data.size === 'all') {
      return errorResponse('SERVICE_UNAVAILABLE', 'size=all (ZIP download) is not yet supported. Use post, story, or youtube.', 400);
    }

    const { render, listTemplates, listBrands, DEFAULT_BRANDS_DIR } = await import('@reelstack/image-gen');

    // Validate brand and template exist before charging credits
    const availableTemplates = listTemplates();
    if (!availableTemplates.includes(parsed.data.template)) {
      return errorResponse('VALIDATION_ERROR', `Template '${parsed.data.template}' not found. Available: ${availableTemplates.join(', ')}`, 400);
    }
    const availableBrands = listBrands(DEFAULT_BRANDS_DIR);
    if (!availableBrands.includes(parsed.data.brand)) {
      return errorResponse('VALIDATION_ERROR', `Brand '${parsed.data.brand}' not found. Available: ${availableBrands.join(', ')}`, 400);
    }

    const cost = await getCreditCost('image');
    const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
    const { consumed } = await consumeCredits(ctx.user.id, limits.creditsPerMonth, cost);
    if (!consumed) {
      return errorResponse(
        'QUOTA_EXCEEDED',
        'Monthly image limit reached and no tokens available. Upgrade or purchase tokens.',
        429,
      );
    }

    let results;
    try {
      results = await render(parsed.data);
    } catch (err) {
      return errorResponse(
        'RENDER_ERROR',
        err instanceof Error ? err.message : 'Render failed',
        500,
      );
    }

    const { png, sizeName } = results[0]!;
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${parsed.data.template}-${parsed.data.brand}-${sizeName}.png"`,
      },
    });
  },
);
