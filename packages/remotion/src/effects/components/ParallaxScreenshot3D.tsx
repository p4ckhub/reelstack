import { useCurrentFrame, useVideoConfig, interpolate, Img } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { ParallaxScreenshot3DEffect } from '../types';

interface Props {
  readonly segment: ParallaxScreenshot3DEffect;
}

const POSITION_MAP: Record<string, React.CSSProperties> = {
  center: { justifyContent: 'center' },
  left: { justifyContent: 'flex-start', paddingLeft: '5%' },
  right: { justifyContent: 'flex-end', paddingRight: '5%' },
};

/**
 * Floating UI screenshot with 3D perspective tilt, deep shadow, and rounded corners.
 * Gentle sine-based float animation on translateY.
 */
export const ParallaxScreenshot3D: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style: animStyle } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    imageUrl,
    tiltDegrees = -10,
    borderRadius = 24,
    shadowDepth = 'deep',
    position = 'center',
  } = segment;

  const startFrame = Math.round(segment.startTime * fps);
  const localFrame = frame - startFrame;

  // Gentle float animation: sine wave on translateY
  const floatY = Math.sin((localFrame / fps) * Math.PI * 0.8) * 12;

  const shadow =
    shadowDepth === 'deep'
      ? '0 20px 60px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)'
      : '0 10px 30px rgba(0,0,0,0.25)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        ...POSITION_MAP[position],
        zIndex: 55,
        pointerEvents: 'none',
        perspective: 800,
        ...animStyle,
      }}
    >
      <div
        style={{
          width: '85%',
          maxWidth: '85%',
          transform: `perspective(800px) rotateY(${tiltDegrees}deg) translateY(${floatY}px)`,
          borderRadius,
          boxShadow: shadow,
          overflow: 'hidden',
        }}
      >
        <Img
          src={resolveMediaUrl(imageUrl)}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            objectFit: 'cover',
          }}
        />
      </div>
    </div>
  );
};
