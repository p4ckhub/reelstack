import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { LightLeakEffect } from '../types';

interface Props {
  readonly segment: LightLeakEffect;
}

export const LightLeak: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const { color = '#FF6B35', intensity = 0.3, speed = 1 } = segment;

  const t = (frame / fps) * speed;

  // Animate gradient position
  const x = 50 + 40 * Math.sin(t * 0.7);
  const y = 30 + 30 * Math.cos(t * 0.5);

  // Secondary warm spot
  const x2 = 50 + 35 * Math.cos(t * 0.9 + 1);
  const y2 = 60 + 25 * Math.sin(t * 0.6 + 2);

  const opacityPulse = interpolate(Math.sin(t * 1.2), [-1, 1], [intensity * 0.6, intensity]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 68,
        pointerEvents: 'none',
        opacity: opacityPulse,
        mixBlendMode: 'screen',
        background: `
          radial-gradient(ellipse 60% 50% at ${x}% ${y}%, ${color}88, transparent 70%),
          radial-gradient(ellipse 40% 40% at ${x2}% ${y2}%, ${color}66, transparent 60%)
        `,
        ...style,
      }}
    />
  );
};
