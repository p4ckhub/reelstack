import { useCurrentFrame, random } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { FilmGrainEffect } from '../types';

interface Props {
  readonly segment: FilmGrainEffect;
}

export const FilmGrain: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const { intensity = 0.15 } = segment;

  // Generate SVG noise that changes every frame
  // ID includes startTime to remain unique when multiple FilmGrain instances overlap
  const filterId = `grain-${segment.startTime}-${frame}`;
  const seed = Math.floor(random(`grain-${segment.startTime}-${frame}`) * 1000);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 71,
        pointerEvents: 'none',
        opacity: intensity,
        mixBlendMode: 'overlay',
        ...style,
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id={filterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="4"
            seed={seed}
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
    </div>
  );
};
