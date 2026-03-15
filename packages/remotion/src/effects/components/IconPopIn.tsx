import { useCurrentFrame, useVideoConfig, spring, Img } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { IconPopInEffect } from '../types';

interface Props {
  readonly segment: IconPopInEffect;
}

const POSITION_MAP: Record<string, React.CSSProperties> = {
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'top-left': { top: '8%', left: '8%' },
  'top-right': { top: '8%', right: '8%' },
  'bottom-left': { bottom: '8%', left: '8%' },
  'bottom-right': { bottom: '8%', right: '8%' },
};

/**
 * Logo/icon that bounces in with spring animation + subtle pulse after landing.
 * Optional glow via drop-shadow filter.
 */
export const IconPopIn: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style: animStyle } = useEffectAnimation(segment);

  if (!visible) return null;

  const { imageUrl, size = 120, position = 'center', glowColor } = segment;

  const startFrame = Math.round(segment.startTime * fps);
  const localFrame = frame - startFrame;

  // Spring entrance: scale 0 -> 1 with overshoot
  const springScale = spring({
    frame: localFrame,
    fps,
    config: { damping: 8, mass: 0.8 },
  });

  // After spring settles (~0.5s), subtle pulse
  const settleFrame = Math.round(fps * 0.5);
  const pulse = localFrame > settleFrame ? 1 + Math.sin(localFrame * 0.15) * 0.05 : 1;

  const scale = springScale * pulse;

  const posStyle = POSITION_MAP[position] ?? POSITION_MAP.center;
  const isCenter = position === 'center';

  const filterValue = glowColor
    ? `drop-shadow(0 0 10px ${glowColor}) drop-shadow(0 0 20px ${glowColor})`
    : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        ...posStyle,
        zIndex: 65,
        pointerEvents: 'none',
        ...animStyle,
      }}
    >
      <Img
        src={resolveMediaUrl(imageUrl)}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          transform: `${isCenter ? 'translate(-50%, -50%) ' : ''}scale(${scale})`,
          filter: filterValue,
        }}
      />
    </div>
  );
};
