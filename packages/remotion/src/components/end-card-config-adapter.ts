/**
 * Adapter from `@reelstack/agent`'s resolved `EndCardConfig` shape to
 * the lower-level `EndCardSelection` consumed by `EndCardLayer`.
 *
 * Used by every module orchestrator that renders into the shared
 * `ReelComposition` / `VideoClipComposition` (which take the legacy
 * `endCard: EndCardSelection` prop). Modules that have their own
 * Remotion composition (n8n-explainer, slideshow) embed
 * `ResolvedEndCardLayer` directly and don't need this adapter.
 */

import type { EndCardSelection } from './EndCardLayer';

export interface EndCardConfigShape {
  readonly enabled?: boolean;
  readonly headline?: string;
  readonly subheadline?: string;
  readonly action?: string;
  readonly durationSeconds?: number;
  readonly accentColor?: string;
  readonly backgroundColor?: string;
}

export function endCardConfigToSelection(
  ec: EndCardConfigShape | undefined,
  opts: { cardSlug?: string; paletteSlug?: string } = {}
): EndCardSelection | undefined {
  if (!ec || ec.enabled === false || !ec.headline) return undefined;
  return {
    cardSlug: opts.cardSlug ?? 'shimmer',
    paletteSlug: opts.paletteSlug ?? 'ocean',
    durationSeconds: ec.durationSeconds ?? 3,
    data: {
      headline: ec.headline,
      subheadline: ec.subheadline,
      action: ec.action,
      accentColor: ec.accentColor,
      backgroundColor: ec.backgroundColor,
    },
  };
}
