import React from 'react';
import { WithWatermarkOverlay } from '../components/WithWatermarkOverlay';
import type { Watermark } from '../schemas/watermark';

/**
 * withWatermark — higher-order component that auto-injects the FREE-tier
 * watermark overlay above any composition.
 *
 * Every composition registered in `Root.tsx` is wrapped through this HOC,
 * so composition authors NEVER have to remember to render the overlay
 * themselves. When a new reel mode ships, it inherits the watermark
 * contract by being registered — no manual wire-up, no forgotten
 * `<WithWatermarkOverlay />` call, no clean-output-for-free regressions.
 *
 * The watermark field must live on the composition's `ReelProps` under
 * the name `watermark: Watermark | undefined` (enforced by
 * `watermarkSchema` from `../schemas/watermark`).
 *
 * While the flag is globally disabled (see decyzje.md 2026-04-18) this
 * HOC is a no-op in practice: `enabled: false` makes the overlay render
 * nothing. Keeping the HOC in place costs zero and prevents the
 * refactor pain of re-wiring every composition later.
 */

/**
 * The HOC is intentionally tolerant: composition props don't have to
 * declare `watermark` (e.g. YouTubeLongFormComposition doesn't yet).
 * We read it via a runtime cast — when absent, the overlay is a no-op.
 * This keeps the HOC pluggable across every composition type without
 * forcing every schema to add the field upfront.
 */
type MaybeWatermarkProp = { watermark?: Watermark };

export function withWatermark<P extends object>(Component: React.ComponentType<P>): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => {
    const watermark = (props as unknown as MaybeWatermarkProp).watermark;
    return (
      <>
        <Component {...props} />
        <WithWatermarkOverlay watermark={watermark} />
      </>
    );
  };
  const name = Component.displayName || Component.name || 'Composition';
  Wrapped.displayName = `withWatermark(${name})`;
  return Wrapped;
}
