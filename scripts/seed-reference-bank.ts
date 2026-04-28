/**
 * Seed default Character rows for the built-in TSA personas. Reference
 * images are NOT seeded — the user uploads those later (admin UI or
 * direct `addReferenceImage` call). Until a primary reference exists,
 * `getPrimaryReferenceUrl` returns null and the asset generator skips
 * injection, which is the intended fail-soft default.
 *
 * Idempotent — safe to re-run. Manual:
 *   bun run scripts/seed-reference-bank.ts
 */
import { prisma, upsertCharacter } from '../packages/database/src/index';

const PERSONAS = [
  {
    slug: 'cyber-retro',
    name: 'Cyber Retro',
    description: 'TSA tech educator persona — neon/cyber visual identity.',
  },
  {
    slug: 'clean-corporate',
    name: 'Clean Corporate',
    description: 'TSA marketing/automation persona — clean corporate look.',
  },
  {
    slug: 'ai-tool-showcase',
    name: 'AI Tool Showcase',
    description: 'TSA practical-tech persona for AI tool demos.',
  },
];

console.log('Seeding reference-bank characters...');

for (const p of PERSONAS) {
  const character = await upsertCharacter(p);
  console.log(`  ✔ ${character.slug} (id=${character.id})`);
}

const rows = await prisma.character.findMany({
  orderBy: { slug: 'asc' },
  include: { references: { select: { kind: true, isPrimary: true } } },
});

console.table(
  rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    referencesCount: r.references.length,
    hasPrimaryPortrait: r.references.some((ref) => ref.kind === 'portrait' && ref.isPrimary),
  }))
);

console.log('\nDone. Add references via admin UI or addReferenceImage(...) later.');
await prisma.$disconnect();
