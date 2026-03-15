import { OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { CircularPipEffect } from '../types';

interface Props {
  readonly segment: CircularPipEffect;
}

const MARGIN = 3; // % from edge

/**
 * Circular PiP with pulsating neon glow border and gentle floating motion.
 * The face "floats" with a sine-based vertical oscillation.
 */
export const CircularPip: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    videoUrl,
    size = 25,
    position = 'bottom-right',
    glowColor = '#00f2ff',
    glowIntensity = 0.6,
  } = segment;

  // Gentle floating motion
  const floatY = Math.sin(frame / 30) * 3;

  // Pulsating glow
  const pulse = 0.6 + 0.4 * Math.sin((frame / fps) * Math.PI * 2);
  const glowSize = Math.round(12 + pulse * glowIntensity * 20);

  const positionStyle: React.CSSProperties = {};
  if (position.includes('top')) positionStyle.top = `${MARGIN}%`;
  if (position.includes('bottom')) positionStyle.bottom = `${MARGIN}%`;
  if (position.includes('left')) positionStyle.left = `${MARGIN}%`;
  if (position.includes('right')) positionStyle.right = `${MARGIN}%`;

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        width: `${size}%`,
        height: 0,
        paddingBottom: `${size}%`,
        borderRadius: '50%',
        border: `3px solid ${glowColor}`,
        overflow: 'hidden',
        zIndex: 70,
        boxShadow: [
          `0 0 ${glowSize}px ${glowColor}80`,
          `0 0 ${glowSize * 2}px ${glowColor}40`,
          `0 4px 20px rgba(0,0,0,0.4)`,
        ].join(', '),
        transform: `translateY(${floatY}px)`,
        ...style,
      }}
    >
      <OffthreadVideo
        muted
        src={resolveMediaUrl(videoUrl)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  );
};
