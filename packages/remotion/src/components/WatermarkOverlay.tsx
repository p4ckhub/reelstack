/**
 * WatermarkOverlay — "reelstack.dev" badge shown on FREE-tier renders.
 *
 * Rotates across 8 safe positions (corners + mid-edges; NEVER over center)
 * so it doesn't occlude the main subject. Deterministic: the same reel
 * always gets the same sequence of positions (driven by `seed`), so
 * re-rendering never shifts the watermark unexpectedly.
 *
 * Paid tiers and OWNER bypass this overlay entirely — gating decision
 * lives in `@reelstack/database` `shouldShowWatermark(user)`. This
 * component just renders whatever `enabled` flag it receives.
 *
 * Render contract: mount as the top-most layer inside any composition
 * that wants to comply with the FREE-tier UX, e.g.:
 *
 *     <AbsoluteFill style={{ zIndex: 100 }}>
 *       <WatermarkOverlay enabled={watermark?.enabled} seed={watermark?.seed} />
 *     </AbsoluteFill>
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, random } from 'remotion';

export interface WatermarkProps {
  /** When false the component renders nothing. Paid tiers / OWNER pass false. */
  readonly enabled: boolean;
  /** Deterministic seed (use the reel/job id) so positions stay stable across re-renders. */
  readonly seed?: string;
  /** Override the text. Defaults to "reelstack.dev". */
  readonly text?: string;
  /** How long (seconds) a single position is shown before rotating. Default 4s. */
  readonly rotateEverySeconds?: number;
}

/**
 * 8 safe positions around the outside edges of the frame — corners and
 * mid-edges. Deliberately skips anywhere near the center so the watermark
 * never covers the main subject of the reel (presenter, product shot, etc.).
 */
const POSITIONS = [
  { left: '4%', top: '4%', tx: '0', ty: '0' }, // top-left
  { left: '96%', top: '4%', tx: '-100%', ty: '0' }, // top-right
  { left: '4%', top: '96%', tx: '0', ty: '-100%' }, // bottom-left
  { left: '96%', top: '96%', tx: '-100%', ty: '-100%' }, // bottom-right
  { left: '50%', top: '3%', tx: '-50%', ty: '0' }, // top-center
  { left: '50%', top: '97%', tx: '-50%', ty: '-100%' }, // bottom-center
  { left: '3%', top: '50%', tx: '0', ty: '-50%' }, // center-left edge
  { left: '97%', top: '50%', tx: '-100%', ty: '-50%' }, // center-right edge
] as const;

export const WatermarkOverlay: React.FC<WatermarkProps> = ({
  enabled,
  seed = '',
  text = 'reelstack.dev',
  rotateEverySeconds = 4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!enabled) return null;

  // Which rotation slot are we in? Each slot deterministically picks a position.
  const slotFrames = Math.max(1, Math.round(fps * rotateEverySeconds));
  const slotIndex = Math.floor(frame / slotFrames);
  const positionIndex = Math.floor(random(`${seed}-wm-${slotIndex}`) * POSITIONS.length);
  const pos = POSITIONS[positionIndex];

  // Fade in on enter, fade out on exit so rotation isn't jarring.
  const progress = (frame % slotFrames) / slotFrames;
  const fade =
    progress < 0.12
      ? interpolate(progress, [0, 0.12], [0, 1])
      : progress > 0.88
        ? interpolate(progress, [0.88, 1], [1, 0])
        : 1;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          transform: `translate(${pos.tx}, ${pos.ty})`,
          opacity: fade * 0.78,
          fontFamily: 'JetBrains Mono, Menlo, monospace',
          fontSize: 22,
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '0.06em',
          padding: '6px 14px',
          borderRadius: 6,
          backgroundColor: 'rgba(0, 0, 0, 0.42)',
          // Subtle outline so text stays readable on any background
          textShadow: '0 0 6px rgba(0, 0, 0, 0.6)',
          whiteSpace: 'nowrap',
          // Thin border hints at a "badge" — reinforces brand without screaming
          border: '1px solid rgba(255, 255, 255, 0.18)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
