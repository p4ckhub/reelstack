import { useCurrentFrame, useVideoConfig, interpolate, random } from 'remotion';
import type { GlitchTransitionEffect } from '../types';

interface Props {
  readonly segment: GlitchTransitionEffect;
}

export const GlitchTransition: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const { rgbSplitAmount = 10, scanlineOpacity = 0.3, displacement = 15 } = segment;

  const durationFrames = endFrame - startFrame;
  const localFrame = frame - startFrame;
  const midpoint = durationFrames / 2;

  // Intensity peaks in the middle
  const intensity =
    localFrame <= midpoint
      ? interpolate(localFrame, [0, midpoint], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : interpolate(localFrame, [midpoint, durationFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

  const seed = `glitch-${segment.startTime}-${localFrame}`;
  const displaceX = (random(seed + '-dx') - 0.5) * displacement * 2 * intensity;
  const displaceY = (random(seed + '-dy') - 0.5) * displacement * intensity;

  // Scanline positions
  const scanlines = Array.from({ length: 8 }, (_, i) => {
    const y = random(`scanline-${segment.startTime}-${i}-${localFrame}`) * 100;
    const h = random(`scanline-h-${segment.startTime}-${i}`) * 3 + 1;
    return { y, h };
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 65,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* RGB split - red channel offset */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(255,0,0,0.1)',
          transform: `translateX(${rgbSplitAmount * intensity}px)`,
          mixBlendMode: 'screen',
          opacity: intensity * 0.6,
        }}
      />

      {/* RGB split - blue channel offset */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,255,0.1)',
          transform: `translateX(${-rgbSplitAmount * intensity}px)`,
          mixBlendMode: 'screen',
          opacity: intensity * 0.6,
        }}
      />

      {/* Pixel displacement blocks */}
      {intensity > 0.3 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${30 + displaceY}%`,
              height: `${5 * intensity}%`,
              transform: `translateX(${displaceX}px)`,
              backgroundColor: `rgba(255,255,255,${0.05 * intensity})`,
              backdropFilter: `blur(${2 * intensity}px)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${65 - displaceY}%`,
              height: `${3 * intensity}%`,
              transform: `translateX(${-displaceX * 0.7}px)`,
              backgroundColor: `rgba(0,255,255,${0.03 * intensity})`,
            }}
          />
        </>
      )}

      {/* Scanlines */}
      {scanlines.map((line, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${line.y}%`,
            height: `${line.h}px`,
            backgroundColor: `rgba(0,0,0,${scanlineOpacity * intensity})`,
          }}
        />
      ))}

      {/* Overall noise overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(
            0deg,
            rgba(0,0,0,${0.03 * intensity}) 0px,
            transparent 1px,
            transparent 2px
          )`,
        }}
      />
    </div>
  );
};
