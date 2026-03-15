import { useCurrentFrame, useVideoConfig, random } from 'remotion';
import type { ScreenShakeEffect } from '../types';

interface Props {
  readonly segment: ScreenShakeEffect;
}

/**
 * Screen shake effect. Unlike other effects, this doesn't render visible content -
 * it's applied as a CSS transform on a full-screen wrapper via the composition.
 * When used standalone, it renders an invisible marker that the composition
 * can query. For simplicity, we render a full-screen container that offsets
 * all children visually using a clip + translate trick on itself.
 *
 * In practice: the composition renders this as a fullscreen overlay with
 * a shifted background-position illusion. Since we can't wrap parent content
 * from a child, we use a semi-transparent flash + transform to simulate shake.
 */
export const ScreenShake: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const { intensity = 8, frequency = 3 } = segment;
  const localFrame = frame - startFrame;

  // Random jitter per frame, scaled by intensity
  const seed = `shake-${segment.startTime}-${localFrame}`;
  const offsetX = (random(seed + '-x') - 0.5) * intensity * 2;
  const offsetY = (random(seed + '-y') - 0.5) * intensity * 2;

  // Reduce intensity over time (damped shake)
  const durationFrames = endFrame - startFrame;
  const damping = 1 - (localFrame / durationFrames) * 0.7;

  return (
    <div
      style={{
        position: 'absolute',
        inset: `-${intensity}px`,
        transform: `translate(${offsetX * damping}px, ${offsetY * damping}px)`,
        zIndex: 5,
        pointerEvents: 'none',
        // We can't actually shake parent content from a child component.
        // Instead we overlay a translucent flash that shifts position to
        // create a visual impact feel.
        background: `radial-gradient(circle, rgba(255,255,255,${0.03 * damping}) 0%, transparent 70%)`,
      }}
    />
  );
};
