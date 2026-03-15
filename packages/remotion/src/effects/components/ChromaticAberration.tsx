import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChromaticAberrationEffect } from '../types';

interface Props {
  readonly segment: ChromaticAberrationEffect;
}

/**
 * Chromatic aberration — subtle permanent RGB split over the entire reel.
 * Uses 3 overlapping color channel layers with slight pixel offset.
 * Designed for full-reel usage. pointer-events: none.
 */
export const ChromaticAberration: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const { intensity = 0.05 } = segment;
  const offsetPx = Math.round(width * intensity);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 91,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
      }}
    >
      {/* Red channel offset left */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(255, 0, 0, 0.06)',
          transform: `translateX(-${offsetPx}px)`,
        }}
      />
      {/* Blue channel offset right */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 255, 0.06)',
          transform: `translateX(${offsetPx}px)`,
        }}
      />
    </div>
  );
};
