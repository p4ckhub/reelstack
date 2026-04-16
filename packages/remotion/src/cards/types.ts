/**
 * Card types — CardProps + metadata + palette contracts.
 *
 * Architecture: cards and palettes live in a flat library. Packs are
 * MANIFESTS that select from the library — one card can appear in many
 * packs without code duplication. Access control is enforced per pack
 * via the Module table (same mechanism that gates render modes).
 */

import type React from 'react';

/** How a card is used within a reel. */
export type CardMode =
  | 'cutaway' // full-screen break in the reel
  | 'overlay-top' // banner across top
  | 'overlay-center' // floating glass panel, centered over whatever is below
  | 'overlay-corner' // small badge in a corner
  | 'cta-outro' // closing CTA at the end
  | 'lower-third'; // bottom-third name card

/** Where an overlay-* card anchors on screen. Only relevant for overlay modes. */
export type Anchor =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'center'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center';

/** Color tokens. Can be registered with a slug OR passed inline in API payload. */
export interface CardPalette {
  slug: string; // "ocean" — flat, no pack prefix
  accent: string; // primary highlight color
  background: string; // base fill
  text: string; // headline/foreground
  textMuted: string; // subheadline / secondary
  glow?: string; // optional — defaults to accent if missing
}

/** Payload passed to any card — keep broad, cards cherry-pick what they need. */
export interface CardData {
  headline?: string;
  subheadline?: string;
  action?: string; // URL / CTA text
  label?: string; // short badge ("LIVE", "NEW")
  [key: string]: string | undefined; // pack-specific extras
}

/** Props every card component receives. */
export interface CardProps {
  mode: CardMode;
  anchor?: Anchor; // only for overlay-* modes
  startFrame: number; // composition frame when card appears
  durationFrames: number; // frames card stays on screen
  totalFrames: number; // composition total (for cta-outro alignment)
  palette: CardPalette;
  data: CardData;
}

/** Registered card metadata — used for discovery + validation. */
export interface CardMetadata {
  slug: string; // "glitch" — flat, no pack prefix
  name: string;
  description: string;
  supportedModes: CardMode[];
  supportedAnchors?: Anchor[]; // if card supports overlay-*
  defaultDurationSeconds: Partial<Record<CardMode, number>>;
  requiredData: (keyof CardData)[];
}

export interface RegisteredCard {
  metadata: CardMetadata;
  Component: React.FC<CardProps>;
}

/** Tier enum mirrors Prisma's Tier — kept in sync via shared @reelstack/types. */
export type PackTier = 'FREE' | 'SOLO' | 'PRO' | 'AGENCY' | 'OWNER';

/**
 * A pack is a curated selection from the card + palette library.
 * The same card can be referenced by multiple packs (no code duplication).
 * Access is gated via the Module table — pack slug becomes a Module row
 * with `kind: CARD_PACK` and optional `requiredTier`.
 */
export interface CardPackManifest {
  slug: string; // "cta-essentials" — matches Module.slug
  name: string; // "CTA Essentials"
  description: string;
  cards: string[]; // card slugs in this pack
  palettes: string[]; // palette slugs in this pack
  requiredTier?: PackTier | null;
  thumbnailUrl?: string;
  previewUrl?: string;
}
