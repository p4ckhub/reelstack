import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { HighlightMarkerEffect } from '../types';

interface Props {
  readonly segment: HighlightMarkerEffect;
}

/**
 * Semi-transparent marker overlay that draws left-to-right like a physical highlighter.
 * Uses mix-blend-mode: multiply for realistic marker look on light backgrounds.
 */
export const HighlightMarker: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style: animStyle } = useEffectAnimation(segment);

  if (!visible) return null;

  const { x, y, width, height, color = '#FFFF00', opacity = 0.35 } = segment;

  const startFrame = Math.round(segment.startTime * fps);
  const localFrame = frame - startFrame;

  // Draw animation: width grows from 0 to full over 0.4s
  const drawDuration = Math.round(fps * 0.4);
  const drawProgress = interpolate(localFrame, [0, drawDuration], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${(width * drawProgress) / 100}%`,
        height: `${height}%`,
        backgroundColor: color,
        opacity,
        mixBlendMode: 'multiply',
        zIndex: 58,
        pointerEvents: 'none',
        borderRadius: 2,
        ...animStyle,
      }}
    />
  );
};
