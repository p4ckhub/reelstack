import { useCurrentFrame, useVideoConfig, interpolate, Img } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { ParallaxScreenshotEffect } from '../types';

interface Props {
  readonly segment: ParallaxScreenshotEffect;
}

export const ParallaxScreenshot: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  if (!visible) return null;

  const {
    url,
    scrollDirection = 'up',
    depth = 1.2,
    borderRadius = 16,
    tiltMode = 'subtle',
  } = segment;

  const is3d = tiltMode === '3d';

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  // Scroll progress over the segment duration
  const scrollProgress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // The screenshot is taller than the viewport - scroll through it
  const scrollOffset =
    scrollDirection === 'up'
      ? scrollProgress * height * depth * 0.5
      : -scrollProgress * height * depth * 0.5;

  // Tilt animation
  const tiltX = is3d
    ? interpolate(scrollProgress, [0, 0.5, 1], [5, 0, -5])
    : interpolate(scrollProgress, [0, 0.5, 1], [2, 0, -2]);
  const tiltY = is3d ? -10 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 15,
        pointerEvents: 'none',
        perspective: 1200,
        ...style,
      }}
    >
      <div
        style={{
          width: '85%',
          height: '80%',
          overflow: 'hidden',
          borderRadius: is3d ? 24 : borderRadius,
          boxShadow: is3d
            ? '0 30px 80px rgba(0,0,0,0.6), 0 10px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)'
            : '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
          transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
        }}
      >
        <Img
          src={resolveMediaUrl(url)}
          style={{
            width: '100%',
            objectFit: 'cover',
            transform: `translateY(${-scrollOffset}px)`,
          }}
        />
      </div>
    </div>
  );
};
