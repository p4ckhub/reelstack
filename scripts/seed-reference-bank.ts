/**
 * Seed Character rows for the registered presenter personas. The slug
 * matches `PresenterPersona.id` so `getPrimaryReferenceUrl(personaId)`
 * resolves directly. Reference images are NOT seeded — the user uploads
 * those later (admin UI or direct `addReferenceImage` call). Until a
 * primary reference exists, lookup returns null and the asset generator
 * skips injection (fail-soft).
 *
 * Personas come from `@reelstack/agent` registry (registered by private
 * modules on import). Run after a fresh DB:
 *   bun run seed:reference-bank
 *
 * Note — personas != montage profiles. Personas are the fictional
 * presenter characters with AI-generated faces (animated-dev, prof-IT,
 * sysadmin, haker). Montage profiles are visual editing styles
 * (cyber-retro, clean-corporate, ai-tool-showcase) and don't carry a
 * face — they don't need entries in the reference bank.
 */
import '@reelstack/modules';
import { listPersonas } from '@reelstack/agent';
import { prisma, upsertCharacter } from '../packages/database/src/index';

const personas = listPersonas();

if (personas.length === 0) {
  console.log('No personas registered — nothing to seed.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Seeding ${personas.length} character row(s)...`);

for (const p of personas) {
  const character = await upsertCharacter({
    slug: p.id,
    name: p.name,
    description: p.scenery,
  });
  console.log(`  ✔ ${character.slug} (${character.name})`);
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
