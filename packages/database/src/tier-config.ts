/** TierConfig queries + idempotent seed. */
import { prisma, prismaRead } from './client';

const TIER_CONFIG_DEFAULTS = [
  { tier: 'FREE', creditsPerMonth: 30, maxFileSizeMb: 100, maxDurationSec: 120 },
  { tier: 'SOLO', creditsPerMonth: 300, maxFileSizeMb: 500, maxDurationSec: 300 },
  { tier: 'PRO', creditsPerMonth: 1000, maxFileSizeMb: 2048, maxDurationSec: 1800 },
  { tier: 'AGENCY', creditsPerMonth: 5000, maxFileSizeMb: 10240, maxDurationSec: -1 },
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
