import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { listAccessibleModules } from '@reelstack/database';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/modules
 *
 * Returns reel-generation modules the authenticated user can access, with
 * per-module credit cost. Used by the wizard UI and by anyone integrating
 * via API to know what's available on their tier.
 *
 * OWNER-tier users see every enabled module in the catalog (tier rank
 * sits above every gating threshold).
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const modules = await listAccessibleModules({
      id: ctx.user.id,
      tier: ctx.user.tier,
    });

    return successResponse({
      modules: modules.map((m) => ({
        slug: m.slug,
        name: m.name,
        description: m.description,
        category: m.category,
        creditCost: m.creditCost,
      })),
    });
  }
);
