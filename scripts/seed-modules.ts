/**
 * Seed module catalog and grant owner access.
 * Idempotent — safe to re-run: upserts every row.
 *
 * Runs automatically on container start (docker/Dockerfile entrypoint) and
 * manually from dev:
 *   bun run scripts/seed-modules.ts
 */
import {
  prisma,
  seedModuleDefaults,
  MODULE_DEFAULTS,
  grantModuleAccess,
} from '../packages/database/src/index';

const OWNER_EMAILS = (process.env.OWNER_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

console.log('Seeding module catalog...');
await seedModuleDefaults();

const rows = await prisma.module.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
console.table(
  rows.map((r) => ({
    slug: r.slug,
    category: r.category,
    creditCost: r.creditCost,
    requiredTier: r.requiredTier ?? '-',
    enabled: r.enabled,
  }))
);

if (OWNER_EMAILS.length > 0) {
  console.log(`\nMarking owner(s): ${OWNER_EMAILS.join(', ')}`);
  const owners = await prisma.user.findMany({
    where: { email: { in: OWNER_EMAILS } },
    select: { id: true, email: true },
  });

  if (owners.length === 0) {
    console.log('  (no matching users found yet - they will be marked on first login)');
  } else {
    // Flip isOwner
    await prisma.user.updateMany({
      where: { email: { in: OWNER_EMAILS } },
      data: { isOwner: true },
    });

    // Grant every gated module explicitly — defensive, in case `isOwner`
    // logic is ever bypassed or an operator flips the flag off by accident.
    const gatedSlugs = MODULE_DEFAULTS.filter((m) => m.requiredTier !== null).map((m) => m.slug);
    for (const owner of owners) {
      for (const slug of gatedSlugs) {
        await grantModuleAccess({ userId: owner.id, moduleSlug: slug, source: 'owner' });
      }
      console.log(`  ✔ ${owner.email}: isOwner=true + grants for ${gatedSlugs.join(', ')}`);
    }
  }
}

console.log('\nDone.');
await prisma.$disconnect();
