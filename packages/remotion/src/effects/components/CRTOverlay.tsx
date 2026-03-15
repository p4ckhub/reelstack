import { useCurrentFrame, useVideoConfig, random } from 'remotion';
import type { CRTOverlayEffect } from '../types';

interface Props {
  readonly segment: CRTOverlayEffect;
}

/**
 * CRT/Scanlines overlay effect.
 * Renders horizontal scanlines + animated film grain over the entire frame.
 * Designed for full-reel usage (startTime=0, endTime=totalDuration).
 */
export const CRTOverlay: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const { opacity = 0.08, scanlineSpacing = 4, grainIntensity = 0.3 } = segment;

  // Deterministic grain offset per frame (shifts the noise pattern)
  const grainSeed = `crt-grain-${frame}`;
  const grainOffsetX = random(grainSeed + '-x') * 200;
  const grainOffsetY = random(grainSeed + '-y') * 200;

  return (
    <>
      {/* Scanlines layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent ${scanlineSpacing - 1}px,
            rgba(0, 0, 0, 0.3) ${scanlineSpacing - 1}px,
            rgba(0, 0, 0, 0.3) ${scanlineSpacing}px
          )`,
          opacity,
          zIndex: 70,
          pointerEvents: 'none',
        }}
      />
      {/* Film grain layer (SVG feTurbulence) */}
      {grainIntensity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 71,
            pointerEvents: 'none',
            opacity: opacity * grainIntensity,
          }}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <filter id={`crt-grain-${startFrame}`}>
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.7"
                numOctaves={3}
                seed={frame % 60}
              />
            </filter>
            <rect
              width="100%"
              height="100%"
              filter={`url(#crt-grain-${startFrame})`}
              transform={`translate(${grainOffsetX % 10}, ${grainOffsetY % 10})`}
            />
          </svg>
        </div>
      )}
    </>
  );
};
