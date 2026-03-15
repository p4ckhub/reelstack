import { useCurrentFrame, useVideoConfig, random } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { TextEmphasisEffect } from '../types';

interface Props {
  readonly segment: TextEmphasisEffect;
}

export const TextEmphasis: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    text,
    fontSize = 96,
    fontColor = '#FFFFFF',
    backgroundColor,
    position = 'center',
    jitter = 0,
    neonGlow,
  } = segment;

  // Frame-seeded random jitter for glitchy text movement
  let jitterX = 0;
  let jitterY = 0;
  if (jitter > 0) {
    const seed = `jitter-${segment.startTime}-${frame}`;
    jitterX = (random(seed + '-x') - 0.5) * jitter * 2;
    jitterY = (random(seed + '-y') - 0.5) * jitter * 2;
  }

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 26,
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
          color: fontColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textShadow: neonGlow
            ? (() => {
                // Pulsing neon flicker (opacity oscillation 0.7-1.0)
                const pulse = 0.7 + 0.3 * Math.sin((frame / fps) * Math.PI * 3);
                const glow30 = Math.round(pulse * 255)
                  .toString(16)
                  .padStart(2, '0');
                const glow60 = Math.round(pulse * 128)
                  .toString(16)
                  .padStart(2, '0');
                return `0 0 10px ${neonGlow}, 0 0 30px ${neonGlow}${glow30}, 0 0 60px ${neonGlow}${glow60}, 0 4px 24px rgba(0,0,0,0.7)`;
              })()
            : '0 4px 24px rgba(0,0,0,0.7), 0 0 60px rgba(0,0,0,0.3)',
          padding: backgroundColor ? '8px 24px' : undefined,
          backgroundColor: backgroundColor ?? undefined,
          borderRadius: backgroundColor ? 8 : undefined,
          ...style,
          ...(jitter > 0 ? { transform: `translate(${jitterX}px, ${jitterY}px)` } : {}),
        }}
      >
        {text}
      </div>
    </div>
  );
};
