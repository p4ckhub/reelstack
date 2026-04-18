/**
 * EndCardLayer — renders a registered library card as a closing overlay
 * for the last `durationSeconds` of the reel.
 *
 * Resolves `cardSlug` + `paletteSlug` from the runtime card registry,
 * which is populated when `@reelstack/modules` is imported by the web
 * app / worker. If either slug is missing from the registry, the layer
 * is a no-op (silent fallback — never crashes the render).
 */

import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { getCard, getPalette } from '../cards';
import type { CardData } from '../cards';

export interface EndCardSelection {
  readonly cardSlug: string;
  readonly paletteSlug: string;
  readonly data: Readonly<Record<string, string | undefined>>;
  readonly durationSeconds?: number;
}

export const EndCardLayer: React.FC<{ endCard: EndCardSelection | undefined }> = ({ endCard }) => {
  const { fps, durationInFrames } = useVideoConfig();

  if (!endCard) return null;

  const card = getCard(endCard.cardSlug);
  const palette = getPalette(endCard.paletteSlug);

  // Fail-closed: if card or palette is missing from registry, render nothing.
  // Avoids masking registry setup bugs with an ugly error card.
  if (!card || !palette) {
    if (typeof console !== 'undefined') {
      console.warn(
        `EndCardLayer: unresolved selection — card="${endCard.cardSlug}" palette="${endCard.paletteSlug}"`
      );
    }
    return null;
  }

  const seconds = endCard.durationSeconds ?? 3;
  const durationFrames = Math.min(Math.round(seconds * fps), durationInFrames);
  const startFrame = Math.max(0, durationInFrames - durationFrames);

  const Component = card.Component;

  return (
    <Sequence from={startFrame} durationInFrames={durationFrames}>
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <Component
          mode="cta-outro"
          startFrame={0}
          durationFrames={durationFrames}
          totalFrames={durationFrames}
          palette={palette}
          data={endCard.data as CardData}
        />
      </AbsoluteFill>
    </Sequence>
  );
};
