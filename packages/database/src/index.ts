import { PrismaClient } from '@prisma/client';
import { isValidStatusTransition } from '@reelstack/types';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Read replica client. Uses DATABASE_READ_URL when set,
 * otherwise falls back to the primary client (same DB).
 * Route analytics/listing queries through this for read scaling.
 */
export const prismaRead: PrismaClient = (() => {
  if (globalForPrisma.prismaRead) return globalForPrisma.prismaRead;

  if (process.env.DATABASE_READ_URL) {
    const client = new PrismaClient({
      datasourceUrl: process.env.DATABASE_READ_URL,
      log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    });
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaRead = client;
    return client;
  }

  // No read replica configured - use primary
  return prisma;
})();

export function createDB(): PrismaClient {
  return prisma;
}

// ==========================================
// User queries
// ==========================================

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function upsertUser(id: string, email: string) {
  return prisma.user.upsert({
    where: { id },
    update: { email },
    create: { id, email },
  });
}


export async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return (user?.preferences as Record<string, unknown>) ?? {};
}

export async function updateUserPreferences(
  userId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const user = await prisma.$queryRaw<Array<{ preferences: Record<string, unknown> }>>`
    UPDATE "User"
    SET preferences = COALESCE(preferences, '{}'::jsonb) || ${JSON.stringify(data)}::jsonb
    WHERE id = ${userId}
    RETURNING preferences
  `;
  return (user[0]?.preferences as Record<string, unknown>) ?? {};
}

export async function updateUserTier(userId: string, tier: 'FREE' | 'SOLO' | 'PRO' | 'AGENCY') {
  return prisma.user.update({
    where: { id: userId },
    data: { tier },
  });
}

export async function getUserBySellfCustomerId(sellfCustomerId: string) {
  return prisma.user.findUnique({ where: { sellfCustomerId } });
}

export async function linkSellfCustomer(userId: string, sellfCustomerId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { sellfCustomerId },
  });
}

// ==========================================
// Usage queries
// ==========================================

/** Returns total credits used this month (SUM of creditCost). */
export async function getMonthlyCreditsUsed(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const result = await prismaRead.reelJob.aggregate({
    where: { userId, createdAt: { gte: startOfMonth } },
    _sum: { creditCost: true },
  });
  return result._sum.creditCost ?? 0;
}

// ==========================================
// Template queries
// ==========================================

export async function createTemplate(data: {
  userId: string;
  name: string;
  description?: string;
  style: object;
  category?: string;
  isPublic?: boolean;
}) {
  return prisma.template.create({
    data: {
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      style: data.style,
      category: data.category ?? 'custom',
      isPublic: data.isPublic ?? false,
    },
  });
}

export async function getTemplatesByUser(userId: string) {
  return prismaRead.template.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getTemplateById(id: string, userId: string) {
  return prismaRead.template.findFirst({ where: { id, userId } });
}

export async function getPublicTemplates(cursor?: string, limit = 20) {
  return prismaRead.template.findMany({
    where: { isPublic: true },
    orderBy: { usageCount: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

export async function updateTemplate(
  id: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    style?: object;
    category?: string;
    isPublic?: boolean;
  }
) {
  return prisma.template.updateMany({
    where: { id, userId },
    data,
  });
}

export async function deleteTemplate(id: string, userId: string) {
  return prisma.template.deleteMany({ where: { id, userId } });
}

export async function incrementTemplateUsage(id: string) {
  return prisma.template.update({
    where: { id },
    data: { usageCount: { increment: 1 } },
  });
}

// ==========================================
// ApiKey queries
// ==========================================

export async function createApiKey(data: {
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
  expiresAt?: Date;
}) {
  return prisma.apiKey.create({
    data: {
      userId: data.userId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      scopes: data.scopes ?? ['*'],
      rateLimitPerMinute: data.rateLimitPerMinute ?? 60,
      expiresAt: data.expiresAt,
    },
  });
}

export async function getApiKeysByUser(userId: string) {
  return prismaRead.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      rateLimitPerMinute: true,
      isActive: true,
      expiresAt: true,
      lastUsedAt: true,
      usageCount: true,
      createdAt: true,
    },
  });
}

export async function getApiKeyByHash(keyHash: string) {
  return prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });
}

export async function revokeApiKey(id: string, userId: string, reason?: string) {
  return prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: reason ?? 'User revoked',
      isActive: false,
    },
  });
}

export async function touchApiKey(id: string, ip?: string) {
  return prisma.apiKey.update({
    where: { id },
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      usageCount: { increment: 1 },
    },
  });
}

// ==========================================
// Token & credit queries
// ==========================================

/**
 * Consume credits: first checks tier monthly budget (SUM-based),
 * then falls back to token balance. Returns true if consumed.
 *
 * Uses SELECT ... FOR UPDATE on the user row to prevent
 * TOCTOU races where concurrent requests both see "under limit" and both proceed.
 *
 * @param cost - number of credits to consume (e.g. 10 for video, 15 for multi-lang, 1 for image)
 */
export async function consumeCredits(
  userId: string,
  monthlyBudget: number,
  cost: number,
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

/**
 * Get credit cost for a product action from DB, with fallback defaults.
 * Cached in-memory for 60s.
 */
const _pricingCache = new Map<string, { cost: number; expiresAt: number }>();

export async function getCreditCost(
  action: string,
  productSlug = 'reelstack',
): Promise<number> {
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

// ==========================================
// ReelJob queries
// ==========================================

export async function createReelJob(data: {
  userId: string;
  script?: string;
  reelConfig?: object;
  apiKeyId?: string;
  creditCost?: number;
  callbackUrl?: string;
  parentJobId?: string;
  language?: string;
}) {
  return prisma.reelJob.create({
    data: {
      userId: data.userId,
      script: data.script,
      reelConfig: data.reelConfig as object | undefined,
      apiKeyId: data.apiKeyId,
      creditCost: data.creditCost ?? 10,
      callbackUrl: data.callbackUrl,
      parentJobId: data.parentJobId,
      language: data.language,
    },
  });
}

export async function getReelJob(id: string, userId: string) {
  return prismaRead.reelJob.findFirst({ where: { id, userId } });
}

export async function getReelJobInternal(id: string) {
  return prisma.reelJob.findUnique({ where: { id } });
}

export async function updateReelJobStatus(
  id: string,
  updates: {
    status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress?: number;
    outputUrl?: string;
    error?: string;
    publishStatus?: object;
    productionMeta?: object;
    startedAt?: Date;
    completedAt?: Date;
  }
) {
  if (updates.status) {
    const current = await prisma.reelJob.findUnique({
      where: { id },
      select: { status: true },
    });

    if (current && !isValidStatusTransition(current.status, updates.status)) {
      throw new Error(
        `Invalid status transition: ${current.status} → ${updates.status} for job ${id}`
      );
    }
  }

  return prisma.reelJob.update({ where: { id }, data: updates });
}

/**
 * Atomically mark callback as sent. Returns true if this call actually flipped the flag.
 * Uses conditional update to prevent duplicate deliveries in concurrent scenarios.
 */
export async function markCallbackSent(id: string): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "ReelJob" SET "callbackSent" = true WHERE id = ${id} AND "callbackSent" = false
  `;
  return updated > 0;
}

/**
 * Reset callbackSent flag so the callback can be retried (e.g. after delivery failure).
 */
export async function resetCallbackSent(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "ReelJob" SET "callbackSent" = false WHERE id = ${id}
  `;
}

export async function getReelJobsByUser(userId: string, limit = 20, cursor?: string) {
  return prismaRead.reelJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

// ==========================================
// TierConfig queries
// ==========================================

const TIER_CONFIG_DEFAULTS = [
  { tier: 'FREE',   creditsPerMonth: 30,    maxFileSizeMb: 100,    maxDurationSec: 120  },
  { tier: 'SOLO',   creditsPerMonth: 300,   maxFileSizeMb: 500,    maxDurationSec: 300  },
  { tier: 'PRO',    creditsPerMonth: 1000,  maxFileSizeMb: 2048,   maxDurationSec: 1800 },
  { tier: 'AGENCY', creditsPerMonth: 5000,  maxFileSizeMb: 10240,  maxDurationSec: -1   },
] as const;

export async function getAllTierConfigs(productSlug = 'reelstack') {
  return prismaRead.tierConfig.findMany({ where: { productSlug } });
}

export async function upsertTierConfig(
  tier: string,
  productSlug: string,
  data: { creditsPerMonth: number; maxFileSizeMb: number; maxDurationSec: number; active?: boolean }
) {
  return prisma.tierConfig.upsert({
    where: { tier_productSlug: { tier, productSlug } },
    update: data,
    create: { tier, productSlug, ...data },
  });
}

/** Idempotent seed — inserts defaults only for missing (tier, productSlug) pairs. */
export async function seedTierDefaults(productSlug = 'reelstack') {
  for (const row of TIER_CONFIG_DEFAULTS) {
    await prisma.tierConfig.upsert({
      where: { tier_productSlug: { tier: row.tier, productSlug } },
      update: {},
      create: { ...row, productSlug },
    });
  }
}

// ==========================================
// AuditLog queries
// ==========================================

export async function createAuditLog(data: {
  userId?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  return prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      target: data.target,
      metadata: data.metadata as object | undefined,
      ip: data.ip,
    },
  });
}

export async function getAuditLogs(options: {
  userId?: string;
  action?: string;
  limit?: number;
  cursor?: string;
}) {
  const { userId, action, limit = 50, cursor } = options;
  return prismaRead.auditLog.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

export { PrismaClient };
export type * from '@prisma/client';
