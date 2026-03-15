import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getMonthlyCreditsUsed, getTokenBalance } from '@reelstack/database';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import { getTierLimits } from '@/lib/api/validation';
import type { TierName } from '@/lib/api/validation';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/user/usage - Get current usage stats */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const tier = (ctx.user.tier ?? 'FREE') as TierName;
    const [creditsUsed, tokenBalance] = await Promise.all([
      getMonthlyCreditsUsed(ctx.user.id),
      getTokenBalance(ctx.user.id),
    ]);
    const limits = await getTierLimits(tier);

    return successResponse({
      tier,
      creditsUsed,
      creditsPerMonth: limits.creditsPerMonth,
      tokenBalance,
    });
  }
);
