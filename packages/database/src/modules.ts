/**
 * Module access control and lookup.
 *
 * Modules are the discrete reel-generation capabilities (slideshow, captions,
 * n8n-explainer, etc.). Each module has:
 *   - a credit cost (some are more expensive because they use more AI)
 *   - optional `requiredTier` gating (null = available to everyone)
 *   - optional explicit grants via UserModuleAccess (purchases, gifts)
 *
 * Access rules (in order of precedence):
 *   1. Explicit non-expired UserModuleAccess grant → allowed.
 *   2. Module with requiredTier = null → allowed for everyone.
 *   3. User tier rank >= requiredTier rank → allowed.
 *   4. Otherwise denied.
 *
 * OWNER tier sits above every paid tier in TIER_RANK, so owner users
 * automatically pass (3) for every gated module — no special casing.
 */
import { prisma, prismaRead } from './index';
import type { Tier, Module as ModuleRow } from '@prisma/client';

// Tier ordering for >= comparisons. Keep in sync with the Tier enum in
// schema.prisma — if you add a tier there, add it here too.
const TIER_RANK: Record<Tier, number> = {
  FREE: 0,
  SOLO: 1,
  PRO: 2,
  AGENCY: 3,
  OWNER: 4,
};

/**
 * Returns true when the user bypasses every credit, access and rate limit.
 * Owner tier is the single source of truth for unlimited access.
 */
export function isUnlimited(user: { tier: Tier } | null | undefined): boolean {
  return user?.tier === 'OWNER';
}

/**
 * Returns true when the given (user, module) pair is permitted to generate
 * content. Call this in API routes *before* kicking off a pipeline.
 *
 * Pass `user` as the loaded row (with `isOwner` and `tier`). Pass the target
 * module by slug — this function looks up the `Module` row once.
 *
 * Returns `false` for unknown or disabled modules.
 */
export async function canUserAccessModule(
  user: { id: string; tier: Tier },
  moduleSlug: string
): Promise<boolean> {
  if (isUnlimited(user)) return true;

  const mod = await prismaRead.module.findUnique({
    where: { slug: moduleSlug },
    select: { id: true, enabled: true, requiredTier: true },
  });
  if (!mod || !mod.enabled) return false;

  // Explicit grant (marketplace purchase, manual, gift, subscription)
  const grant = await prismaRead.userModuleAccess.findUnique({
    where: { userId_moduleId: { userId: user.id, moduleId: mod.id } },
    select: { expiresAt: true },
  });
  if (grant && (grant.expiresAt === null || grant.expiresAt > new Date())) {
    return true;
  }

  if (mod.requiredTier === null) return true;
  return TIER_RANK[user.tier] >= TIER_RANK[mod.requiredTier];
}

/**
 * Returns all modules the given user can use, with their per-module credit
 * cost. Used by the wizard UI and reel-create validation.
 */
export async function listAccessibleModules(user: {
  id: string;
  tier: Tier;
}): Promise<ModuleRow[]> {
  const modules = await prismaRead.module.findMany({
    where: { enabled: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  if (isUnlimited(user)) return modules;

  // Fetch all grants in one query — avoids N+1 when the catalog grows.
  const grants = await prismaRead.userModuleAccess.findMany({
    where: {
      userId: user.id,
      moduleId: { in: modules.map((m) => m.id) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { moduleId: true },
  });
  const grantedIds = new Set(grants.map((g) => g.moduleId));

  return modules.filter((m) => {
    if (grantedIds.has(m.id)) return true;
    if (m.requiredTier === null) return true;
    return TIER_RANK[user.tier] >= TIER_RANK[m.requiredTier];
  });
}

/** Returns the module row by slug (for loading credit cost before consumption). */
export async function getModuleBySlug(slug: string): Promise<ModuleRow | null> {
  return prismaRead.module.findUnique({ where: { slug } });
}

/**
 * Default module catalog — seeded on deploy. Matches the modules currently
 * implemented in `packages/modules/src/` (public) and the private repo.
 *
 * Update `creditCost` here rather than editing DB rows by hand; the seed is
 * idempotent and uses upsert, so changes propagate on next deploy.
 */
export const MODULE_DEFAULTS: ReadonlyArray<{
  slug: string;
  name: string;
  description: string;
  category: 'core' | 'premium' | 'experimental';
  creditCost: number;
  requiredTier: Tier | null;
}> = [
  // Slugs match the values of `reelModeSchema` in
  // apps/web/src/lib/api/v1/reel-schemas.ts so that the API `mode`
  // field maps directly to a catalog row — no translation table needed.
  {
    slug: 'generate',
    name: 'Full auto',
    description: 'Script in, AI discovers tools and plans shots automatically.',
    category: 'core',
    creditCost: 15,
    requiredTier: null,
  },
  {
    slug: 'compose',
    name: 'Compose',
    description: 'Arrange your own assets with AI-generated narration and cuts.',
    category: 'core',
    creditCost: 12,
    requiredTier: null,
  },
  {
    slug: 'slideshow',
    name: 'Slideshow',
    description: 'Script narrated over a slideshow with karaoke captions.',
    category: 'core',
    creditCost: 10,
    requiredTier: null,
  },
  {
    slug: 'captions',
    name: 'Captions',
    description: 'Add karaoke-style captions to any existing video.',
    category: 'core',
    creditCost: 8,
    requiredTier: null,
  },
  {
    slug: 'talking-object',
    name: 'Talking Objects',
    description: 'Everyday objects animated with AI to narrate your script.',
    category: 'premium',
    creditCost: 15,
    requiredTier: null,
  },
  {
    slug: 'n8n-explainer',
    name: 'n8n Explainer',
    description: 'Animated workflow walkthroughs for n8n automations.',
    category: 'premium',
    creditCost: 20,
    // Gated: only explicit grants (owner) can access until we open it up.
    requiredTier: 'AGENCY',
  },
  {
    slug: 'presenter-explainer',
    name: 'Talking Head',
    description: 'AI-generated presenter reads your script on camera.',
    category: 'premium',
    creditCost: 30,
    requiredTier: 'PRO',
  },
];

/**
 * Seed the module catalog. Idempotent: matching slugs are updated in place,
 * missing ones are created. Does not delete modules not in the defaults —
 * custom/private entries stay intact.
 */
export async function seedModuleDefaults(): Promise<void> {
  for (const mod of MODULE_DEFAULTS) {
    await prisma.module.upsert({
      where: { slug: mod.slug },
      update: {
        name: mod.name,
        description: mod.description,
        category: mod.category,
        creditCost: mod.creditCost,
        requiredTier: mod.requiredTier,
      },
      create: mod,
    });
  }
}

/**
 * Grant explicit module access to a user. Used by:
 *   - Seed script (owner grants)
 *   - Phase 3: Stripe webhook on purchase
 *   - Admin tools
 */
export async function grantModuleAccess(args: {
  userId: string;
  moduleSlug: string;
  source?: string;
  expiresAt?: Date | null;
}): Promise<void> {
  const mod = await prisma.module.findUnique({
    where: { slug: args.moduleSlug },
    select: { id: true },
  });
  if (!mod) throw new Error(`Module not found: ${args.moduleSlug}`);

  await prisma.userModuleAccess.upsert({
    where: { userId_moduleId: { userId: args.userId, moduleId: mod.id } },
    update: {
      expiresAt: args.expiresAt ?? null,
      source: args.source ?? 'manual',
    },
    create: {
      userId: args.userId,
      moduleId: mod.id,
      expiresAt: args.expiresAt ?? null,
      source: args.source ?? 'manual',
    },
  });
}
