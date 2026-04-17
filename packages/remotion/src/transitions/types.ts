/**
 * Transition types — bridge between two scenes in a reel.
 *
 * Mirrors the card system architecturally:
 *  - A flat library of transition components (private repo)
 *  - Pack manifests that curate selections for sale/licensing (Module table, kind=TRANSITION_PACK)
 *  - Palette-configurable where it makes visual sense (glitch-cut, ink-wipe, portal)
 *
 * Built on top of `@remotion/transitions` — each preset exposes a
 * TransitionPresentation that `<TransitionSeries>` consumes. We don't
 * reinvent the two-scene rendering loop, we add curated content.
 */

import type { ComponentType } from 'react';
import type { CardPalette, PackTier } from '../cards/types';

export type PresentationDirection = 'entering' | 'exiting';

/** Props every transition presentation component receives. */
export interface TransitionPresentationComponentProps<
  PresentationProps extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly presentationProgress: number;
  readonly children: React.ReactNode;
  readonly presentationDirection: PresentationDirection;
  readonly passedProps: PresentationProps;
  readonly presentationDurationInFrames: number;
}

/** Shape Remotion expects — component + its bound props. */
export interface TransitionPresentation<
  PresentationProps extends Record<string, unknown> = Record<string, unknown>,
> {
  component: ComponentType<TransitionPresentationComponentProps<PresentationProps>>;
  props: PresentationProps;
}

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
