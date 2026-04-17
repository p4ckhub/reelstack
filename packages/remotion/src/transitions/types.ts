/**
 * Transition types — curation layer on top of `@remotion/transitions`.
 *
 * We DO NOT redefine Remotion's `TransitionPresentation` or
 * `TransitionPresentationComponentProps` — we import them directly and
 * re-export. This keeps the licensing trail clean (we consume Remotion's
 * public API, we are not a derivative of Remotion) and guarantees we
 * stay in sync with the upstream type definitions.
 *
 * Our own types (`TransitionMetadata`, `TransitionPackManifest`,
 * `RegisteredTransition`, etc.) are pure curation metadata — slugs,
 * descriptions, tier gating. Those are our original work.
 */

import type {
  TransitionPresentation as RemotionTransitionPresentation,
  TransitionPresentationComponentProps as RemotionTransitionPresentationComponentProps,
} from '@remotion/transitions';
import type { CardPalette, PackTier } from '../cards/types';

// ── Re-exports from @remotion/transitions (single source of truth) ──────
// PresentationDirection isn't a public export, so we pull it via indexed
// access on the public component-props type. This still keeps us on the
// API surface — no code duplication.
export type PresentationDirection = RemotionTransitionPresentationComponentProps<
  Record<string, unknown>
>['presentationDirection'];

export type TransitionPresentationComponentProps<
  P extends Record<string, unknown> = Record<string, unknown>,
> = RemotionTransitionPresentationComponentProps<P>;

export type TransitionPresentation<P extends Record<string, unknown> = Record<string, unknown>> =
  RemotionTransitionPresentation<P>;

// ── Our own curation/metadata types ────────────────────────────────────

/** Props callers may pass when invoking the preset factory. */
export interface TransitionInvocationProps {
  /** Optional palette for transitions that use color (glitch-cut, ink-wipe, portal, …). */
  palette?: CardPalette;
  /** Override default direction for directional presets (slide, wipe, push). */
  direction?: 'left' | 'right' | 'up' | 'down';
}

/** Registered transition metadata — for discovery + validation. */
export interface TransitionMetadata {
  slug: string;
  name: string;
  description: string;
  /** Default transition window length, in frames at 30fps — callers can override. */
  defaultDurationFrames: number;
  /** Whether this transition visually reacts to palette (accent/background). */
  usesPalette: boolean;
  /** Whether this transition supports `direction` override. */
  supportsDirection: boolean;
}

/**
 * Preset factory — takes optional invocation props, returns a presentation.
 * `any` on the generic because React.ComponentType is contravariant in its
 * props, so narrower-typed presentations can't be assigned to a broader
 * Record<string, unknown>. At call sites we just pass the presentation into
 * <TransitionSeries.Transition presentation={...} /> which accepts it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransitionFactory = (props?: TransitionInvocationProps) => TransitionPresentation<any>;

export interface RegisteredTransition {
  metadata: TransitionMetadata;
  factory: TransitionFactory;
}

/** Pack manifest — mirrors CardPackManifest. */
export interface TransitionPackManifest {
  slug: string; // "transition-essentials"
  name: string;
  description: string;
  transitions: string[]; // transition slugs
  requiredTier?: PackTier | null;
  thumbnailUrl?: string;
  previewUrl?: string;
}
