/**
 * Reference bank — DB layer for the `Character` and `ReferenceImage`
 * tables that back the `referenceImageUrl` injection in asset generation.
 *
 * Lookup flow used by the agent's asset-generator: given a persona slug
 * (e.g. "cyber-retro"), fetch the matching `Character` and its primary
 * portrait `ReferenceImage`. The asset-generator wires the URL into
 * `AssetGenerationRequest.referenceImageUrl` so every shot of that
 * persona pulls from the same canonical reference. This is the 2026
 * industry standard across Veo / Kling / Sora / LTX-2 / Wan / HeyGen /
 * Runway References — all consume an optional reference image to keep
 * the same character across shots.
 *
 * Foundation for Tier 2.4 Identity gate (master plan) — the gate scores
 * generated assets against this same reference image.
 */
import { prisma, prismaRead } from './client';
import type { Character, ReferenceImage } from '@prisma/client';

export type ReferenceImageKind = 'portrait' | 'fullbody' | 'environment';

export interface CharacterWithPrimaryReference {
  readonly character: Character;
  readonly primaryReference: ReferenceImage | null;
}

/**
 * Look up a character by stable slug. Slugs are case-sensitive and
 * match the persona id (e.g. "cyber-retro"). Returns `null` if no
 * row exists yet — callers must treat this as "no reference available"
 * and skip injection rather than failing.
 */
export async function getCharacterBySlug(slug: string): Promise<Character | null> {
  return prismaRead.character.findUnique({ where: { slug } });
}

/**
 * Resolve the primary reference URL for a given persona slug + kind.
 * Returns `null` if the character does not exist or has no primary
 * reference for that kind. Callers (the asset-generator) treat `null`
 * as "skip injection" — never throw, never inject placeholders.
 *
 * Defaults to `kind = 'portrait'` because talking-head shots are the
 * primary consumer; future B-roll / environment shots can opt into
 * other kinds explicitly.
 */
export async function getPrimaryReferenceUrl(
  slug: string,
  kind: ReferenceImageKind = 'portrait'
): Promise<string | null> {
  const character = await prismaRead.character.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!character) return null;

  const ref = await prismaRead.referenceImage.findFirst({
    where: { characterId: character.id, kind, isPrimary: true },
    select: { url: true },
    orderBy: { createdAt: 'desc' },
  });
  return ref?.url ?? null;
}

/**
 * Idempotent character upsert by slug. Used by the seed script and
 * future admin UI. `ownerUserId = null` means a global/system character
 * (the default for built-in personas); pass a user id to scope the
 * character to a single user.
 */
export async function upsertCharacter(input: {
  slug: string;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
}): Promise<Character> {
  return prisma.character.upsert({
    where: { slug: input.slug },
    create: {
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      ownerUserId: input.ownerUserId ?? null,
    },
    update: {
      name: input.name,
      description: input.description ?? null,
      ownerUserId: input.ownerUserId ?? null,
    },
  });
}

/**
 * Add a reference image to a character. When `isPrimary` is true the
 * function first demotes any existing primary of the same kind so the
 * `(characterId, kind, isPrimary=true)` invariant stays at one row per
 * kind. Plain `Prisma.unique` won't model this cleanly so we keep the
 * uniqueness as a service-level invariant.
 */
export async function addReferenceImage(input: {
  characterId: string;
  url: string;
  kind?: ReferenceImageKind;
  description?: string | null;
  isPrimary?: boolean;
}): Promise<ReferenceImage> {
  const kind = input.kind ?? 'portrait';
  const isPrimary = input.isPrimary ?? false;

  if (isPrimary) {
    await prisma.referenceImage.updateMany({
      where: { characterId: input.characterId, kind, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  return prisma.referenceImage.create({
    data: {
      characterId: input.characterId,
      url: input.url,
      kind,
      description: input.description ?? null,
      isPrimary,
    },
  });
}
