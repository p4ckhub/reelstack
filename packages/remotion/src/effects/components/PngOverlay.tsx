import { Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { PngOverlayEffect } from '../types';

interface Props {
  readonly segment: PngOverlayEffect;
}

export const PngOverlay: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const { url, position = { x: 50, y: 50 }, size = 30, opacity = 1, animation = 'none' } = segment;

  // Bounce-pulse: gentle scale oscillation after entrance
  let pulseScale = 1;
  if (animation === 'bounce-pulse') {
    const startFrame = Math.round(segment.startTime * fps);
    const localFrame = frame - startFrame;
    // After entrance settles (~0.5s), start pulsing
    const pulseStart = Math.round(0.5 * fps);
    if (localFrame > pulseStart) {
      pulseScale = 1 + 0.05 * Math.sin(((localFrame - pulseStart) / fps) * Math.PI * 2);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        width: `${size}%`,
        zIndex: 30,
        pointerEvents: 'none',
        opacity,
        ...style,
        ...(style.transform || pulseScale !== 1
          ? {
              transform:
                `translate(-50%, -50%) ${style.transform ?? ''} scale(${pulseScale})`.trim(),
            }
          : {}),
      }}
    >
      <Img
        src={resolveMediaUrl(url)}
        style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
      />
    </div>
  );
};
