import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { VignetteOverlayEffect } from '../types';

interface Props {
  readonly segment: VignetteOverlayEffect;
}

/**
 * Vignette overlay — darkened corners via radial gradient.
 * Designed for full-reel usage. pointer-events: none.
 */
export const VignetteOverlay: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const { intensity = 0.3, color = '#000000' } = segment;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 50%, ${color} 100%)`,
        opacity: intensity,
        zIndex: 90,
        pointerEvents: 'none',
      }}
    />
  );
};
