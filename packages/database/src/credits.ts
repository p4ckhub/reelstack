/**
 * Credit consumption and pricing.
 *
 * Two pools feed reel renders:
 *   1. Tier monthly budget — SUM of ReelJob.creditCost within the current month.
 *   2. Token balance — one-time purchases (Sellf orders, gifts, promos).
 *
 * `consumeCredits` drains them in that order with a SELECT FOR UPDATE lock on
 * the user row so concurrent requests can't both squeeze past the budget.
 *
 * `getCreditCost` reads per-action pricing from DB with 60s in-memory cache
 * and hardcoded fallbacks. Per-module pricing (slideshow, captions, ...) lives
 * in `Module.creditCost` and is fetched via `getModuleBySlug` in `./modules`.
 */
import { prisma, prismaRead } from './client';

/**
 * Consume credits: first checks tier monthly budget (SUM-based),
 * then falls back to token balance. Returns true if consumed.
 *
 * Uses SELECT ... FOR UPDATE on the user row to prevent TOCTOU races where
 * concurrent requests both see "under limit" and both proceed.
 *
 * @param cost number of credits to consume (e.g. 10 for video, 15 for multi-lang, 1 for image)
 */
export async function consumeCredits(
  userId: string,
  monthlyBudget: number,
  cost: number
): Promise<{ consumed: boolean; source: 'tier' | 'token' | null }> {
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error(`Invalid credit cost: ${cost}`);
  }
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {
    // Lock user row to serialize concurrent credit checks
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`;

    // SUM-based: count total credits used this month, not number of jobs
    const result = await tx.reelJob.aggregate({
      where: { userId, createdAt: { gte: startOfMonth } },
      _sum: { creditCost: true },
    });
    const usedCredits = result._sum.creditCost ?? 0;

    if (usedCredits + cost <= monthlyBudget) {
      return { consumed: true, source: 'tier' as const };
    }

    // Tier budget exhausted - try token balance (atomic update prevents going below 0)
    const updated = await tx.$executeRaw`
      UPDATE "User" SET "tokenBalance" = "tokenBalance" - ${cost} WHERE id = ${userId} AND "tokenBalance" >= ${cost}
    `;
    if (updated > 0) {
      await tx.tokenTransaction.create({
        data: { userId, amount: -cost, reason: 'render' },
      });
      return { consumed: true, source: 'token' as const };
    }

    return { consumed: false, source: null };
  });
}

const _pricingCache = new Map<string, { cost: number; expiresAt: number }>();

/** Per-action credit pricing from DB with 60s cache. Falls back to hardcoded defaults. */
export async function getCreditCost(action: string, productSlug = 'reelstack'): Promise<number> {
  const key = `${productSlug}:${action}`;
  const cached = _pricingCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.cost;

  const DEFAULTS: Record<string, number> = {
    video: 10,
    video_multilang: 15,
    image: 1,
  };

  try {
    const row = await prisma.creditPricing.findUnique({
      where: { productSlug_action: { productSlug, action } },
    });
    if (row && row.active && row.creditCost > 0) {
      _pricingCache.set(key, { cost: row.creditCost, expiresAt: Date.now() + 60_000 });
      return row.creditCost;
    }
  } catch {
    // DB unavailable — fall through to defaults
  }

  return DEFAULTS[action] ?? 10;
}

export async function addTokens(
  userId: string,
  amount: number,
  reason: string,
  sellfOrderId?: string
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid token amount: ${amount}`);
  }
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: amount } },
    });
    return tx.tokenTransaction.create({
      data: { userId, amount, reason, sellfOrderId },
    });
  });
}

export async function getTokenBalance(userId: string): Promise<number> {
  const user = await prismaRead.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  return user?.tokenBalance ?? 0;
}

export async function getTokenTransactions(userId: string, limit = 50) {
  return prismaRead.tokenTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
