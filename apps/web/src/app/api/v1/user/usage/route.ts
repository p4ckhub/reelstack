import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getMonthlyCreditsUsed, getTokenBalance, getCreditCost } from '@reelstack/database';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import { getTierLimits } from '@/lib/api/validation';
import type { TierName } from '@/lib/api/validation';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/user/usage - Get current usage stats */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const tier = (ctx.user.tier ?? 'FREE') as TierName;
    const [creditsUsed, tokenBalance, videoCost] = await Promise.all([
      getMonthlyCreditsUsed(ctx.user.id),
      getTokenBalance(ctx.user.id),
      getCreditCost('video'),
    ]);
    const limits = await getTierLimits(tier);

    // First day of next month (UTC), for the credit reset countdown.
    const now = new Date();
    const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return successResponse({
      tier,
      creditsUsed,
      creditsPerMonth: limits.creditsPerMonth,
      creditsPerReel: videoCost,
      tokenBalance,
      resetsAt: resetsAt.toISOString(),
    });
  }
);
