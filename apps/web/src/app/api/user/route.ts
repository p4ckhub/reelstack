import { getAuthUser } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/errors';
import { getMonthlyCreditsUsed, getTokenBalance } from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import type { TierName } from '@/lib/api/validation';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return apiError(401, 'Unauthorized');

  const tier = auth.dbUser.tier as TierName;
  const [creditsUsed, tokenBalance] = await Promise.all([
    getMonthlyCreditsUsed(auth.dbUser.id),
    getTokenBalance(auth.dbUser.id),
  ]);
  const limits = await getTierLimits(tier);

  return apiSuccess({
    id: auth.dbUser.id,
    email: auth.dbUser.email,
    tier,
    creditsUsed,
    creditsPerMonth: limits.creditsPerMonth,
    tokenBalance,
    createdAt: auth.dbUser.createdAt,
  });
}
