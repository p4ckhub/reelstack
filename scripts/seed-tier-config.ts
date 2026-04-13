/**
 * Seed default TierConfig rows for a given product.
 * Idempotent — safe to re-run: skips rows that already exist.
 *
 * Usage:
 *   bun run scripts/seed-tier-config.ts
 *   bun run scripts/seed-tier-config.ts social-media-gen
 */
import { seedTierDefaults, prisma } from '../packages/database/src/index';

const productSlug = process.argv[2] ?? 'reelstack';

console.log(`Seeding TierConfig for product: "${productSlug}" ...`);
await seedTierDefaults(productSlug);

const rows = await prisma.tierConfig.findMany({ where: { productSlug } });
console.table(
  rows.map((r) => ({
    tier: r.tier,
    creditsPerMonth: r.creditsPerMonth,
    maxFileSizeMb: r.maxFileSizeMb,
    maxDurationSec: r.maxDurationSec === -1 ? '∞' : r.maxDurationSec,
    active: r.active,
  }))
);

console.log('Done.');
await prisma.$disconnect();
