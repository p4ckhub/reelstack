/**
 * ResolvedEndCardLayer — adapter from `@reelstack/agent`'s `EndCardConfig`
 * (resolved by `resolveEndCard()`) to the existing `EndCardLayer` which
 * speaks the lower-level card-registry shape (`cardSlug` / `paletteSlug` /
 * `data` / `durationSeconds`).
 *
 * Every reel mode that supports an end card renders this single component
 * at the end of its composition, e.g.
 *
 *   <ResolvedEndCardLayer endCard={endCard} />
 *
 * The shared resolver fills in platform-correct copy (IG comment-DM, TT
 * link-in-bio, etc.) so the same `endCard: { platform: 'ig' }` payload
 * produces consistent output regardless of which mode is rendering.
 */

import React from 'react';
import { EndCardLayer, type EndCardSelection } from './EndCardLayer';

/**
 * Subset of `EndCardConfig` from `@reelstack/agent`. Duplicated here to
 * avoid pulling the agent package into the Remotion bundle just for a
 * type — fields stay in sync via the orchestrator that produces them.
 */
export interface EndCardConfigLike {
  readonly enabled?: boolean;
  readonly headline?: string;
  readonly subheadline?: string;
  readonly action?: string;
  readonly durationSeconds?: number;
  readonly accentColor?: string;
  readonly backgroundColor?: string;
}

export interface ResolvedEndCardLayerProps {
  readonly endCard: EndCardConfigLike | undefined;
  /**
   * Card visual to use. Defaults to `shimmer` (purple gradient + mono
   * action label). Modules can override via the request payload if a
   * specific look fits the mode better.
   */
  readonly cardSlug?: string;
  /** Palette name from the registry. Defaults to `ocean`. */
  readonly paletteSlug?: string;
}

export const ResolvedEndCardLayer: React.FC<ResolvedEndCardLayerProps> = ({
  endCard,
  cardSlug = 'shimmer',
  paletteSlug = 'ocean',
}) => {
  if (!endCard || endCard.enabled === false) return null;
  if (!endCard.headline) return null;

  const selection: EndCardSelection = {
    cardSlug,
    paletteSlug,
    durationSeconds: endCard.durationSeconds ?? 3,
    data: {
      headline: endCard.headline,
      subheadline: endCard.subheadline,
      action: endCard.action,
      // accentColor / backgroundColor are honoured by the underlying
      // card via palette overrides — we forward them through `data` so
      // the card component can read them when set.
      accentColor: endCard.accentColor,
      backgroundColor: endCard.backgroundColor,
    },
  };

  return <EndCardLayer endCard={selection} />;
};
