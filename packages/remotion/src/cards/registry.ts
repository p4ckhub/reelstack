/**
 * Card, palette and pack registries.
 *
 * Cards + palettes live in a flat pool (library). Packs are manifests
 * that reference card/palette slugs — same card can be in multiple packs.
 * Registration is eager (Remotion bundles must see all components at
 * build time; a deferred registerCard() wouldn't reach the webpack bundle).
 */

import type { CardMode, CardPackManifest, CardPalette, RegisteredCard } from './types';

const CARDS = new Map<string, RegisteredCard>();
const PALETTES = new Map<string, CardPalette>();
const PACKS = new Map<string, CardPackManifest>();

// ── Cards ────────────────────────────────────────────────────────────

export function registerCard(card: RegisteredCard): void {
  if (CARDS.has(card.metadata.slug)) {
    throw new Error(`Card "${card.metadata.slug}" is already registered`);
  }
  CARDS.set(card.metadata.slug, card);
}

export function getCard(slug: string): RegisteredCard | undefined {
  return CARDS.get(slug);
}

export function listCards(): RegisteredCard[] {
  return Array.from(CARDS.values());
}

export function listCardsForMode(mode: CardMode): RegisteredCard[] {
  return listCards().filter((c) => c.metadata.supportedModes.includes(mode));
}

// ── Palettes ─────────────────────────────────────────────────────────

export function registerPalette(palette: CardPalette): void {
  if (PALETTES.has(palette.slug)) {
    throw new Error(`Palette "${palette.slug}" is already registered`);
  }
  PALETTES.set(palette.slug, palette);
}

export function getPalette(slug: string): CardPalette | undefined {
  return PALETTES.get(slug);
}

export function listPalettes(): CardPalette[] {
  return Array.from(PALETTES.values());
}

// ── Packs ────────────────────────────────────────────────────────────

export function registerCardPack(manifest: CardPackManifest): void {
  if (PACKS.has(manifest.slug)) {
    throw new Error(`Card pack "${manifest.slug}" is already registered`);
  }
  PACKS.set(manifest.slug, manifest);
}

export function getCardPack(slug: string): CardPackManifest | undefined {
  return PACKS.get(slug);
}

export function listCardPacks(): CardPackManifest[] {
  return Array.from(PACKS.values());
}

/** Cards that belong to a specific pack (resolved via manifest). */
export function listCardsForPack(packSlug: string): RegisteredCard[] {
  const pack = PACKS.get(packSlug);
  if (!pack) return [];
  return pack.cards
    .map((cardSlug) => CARDS.get(cardSlug))
    .filter((c): c is RegisteredCard => c !== undefined);
}

/** Palettes included in a pack (resolved via manifest). */
export function listPalettesForPack(packSlug: string): CardPalette[] {
  const pack = PACKS.get(packSlug);
  if (!pack) return [];
  return pack.palettes
    .map((palSlug) => PALETTES.get(palSlug))
    .filter((p): p is CardPalette => p !== undefined);
}

/** All packs that include a given card — used for access checks. */
export function getPacksContainingCard(cardSlug: string): CardPackManifest[] {
  return listCardPacks().filter((p) => p.cards.includes(cardSlug));
}

/** All packs that include a given palette. */
export function getPacksContainingPalette(paletteSlug: string): CardPackManifest[] {
  return listCardPacks().filter((p) => p.palettes.includes(paletteSlug));
}
