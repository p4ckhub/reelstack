import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { NeonGlowTextEffect } from '../types';

interface Props {
  readonly segment: NeonGlowTextEffect;
}

/**
 * Neon glow text with organic flickering effect.
 * Multiple text-shadow layers create the intense neon look.
 */
export const NeonGlowText: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const { text, color = '#00f2ff', fontSize = 72, position = 'center' } = segment;

  // Organic flicker using combined sine waves
  const noise = Math.sin(frame * 0.3) * Math.sin(frame * 0.7);
  const flickerOpacity = 0.7 + 0.3 * noise;

  // Build neon glow text-shadow layers
  const glowAlpha = Math.round(flickerOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  const glowAlphaHalf = Math.round(flickerOpacity * 128)
    .toString(16)
    .padStart(2, '0');

  const textShadow = [
    `0 0 7px ${color}`,
    `0 0 20px ${color}${glowAlpha}`,
    `0 0 42px ${color}${glowAlphaHalf}`,
    `0 0 80px ${color}40`,
    `0 4px 24px rgba(0,0,0,0.5)`,
  ].join(', ');

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 75,
    pointerEvents: 'none',
  };

  if (position === 'top') positionStyle.top = '10%';
  else if (position === 'bottom') positionStyle.bottom = '10%';
  else {
    positionStyle.top = '50%';
    positionStyle.transform = 'translateY(-50%)';
  }

  return (
    <div style={positionStyle}>
      <div
        style={{
          fontSize,
          fontWeight: 900,
          fontFamily: 'Outfit, Impact, sans-serif',
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textShadow,
          opacity: flickerOpacity,
          ...style,
        }}
      >
        {text}
      </div>
    </div>
  );
};
