import { OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { RectangularPipEffect } from '../types';

interface Props {
  readonly segment: RectangularPipEffect;
}

const MARGIN = 3; // % from edge

export const RectangularPip: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    videoUrl,
    position = 'bottom-right',
    width = 40,
    height = 30,
    borderColor = '#3B82F6',
    borderWidth = 3,
    borderGlow = true,
    borderRadius = 12,
    shape = 'rectangle',
  } = segment;

  const isCircle = shape === 'circle';

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
        width: isCircle ? `${Math.min(width, height)}%` : `${width}%`,
        height: isCircle ? '0' : `${height}%`,
        paddingBottom: isCircle ? `${Math.min(width, height)}%` : undefined,
        borderRadius: isCircle ? '50%' : borderRadius,
        border: `${borderWidth}px solid ${borderColor}`,
        overflow: 'hidden',
        zIndex: 22,
        boxShadow: (() => {
          if (!borderGlow) return '0 4px 20px rgba(0,0,0,0.4)';
          if (isCircle) {
            // Pulsing neon glow for circle PiP
            const pulse = 0.6 + 0.4 * Math.sin((frame / fps) * Math.PI * 2);
            const glowSize = Math.round(20 + pulse * 15);
            return `0 0 ${glowSize}px ${borderColor}80, 0 0 ${glowSize * 2}px ${borderColor}40, 0 4px 20px rgba(0,0,0,0.4)`;
          }
          return `0 0 20px ${borderColor}80, 0 4px 20px rgba(0,0,0,0.4)`;
        })(),
        ...style,
      }}
    >
      <OffthreadVideo
        muted
        src={resolveMediaUrl(videoUrl)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};
