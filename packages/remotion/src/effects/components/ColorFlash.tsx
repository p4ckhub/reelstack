import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { ColorFlashEffect } from '../types';

interface Props {
  readonly segment: ColorFlashEffect;
}

export const ColorFlash: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const { color = '#FFFFFF', maxOpacity = 0.6 } = segment;
  const durationFrames = endFrame - startFrame;
  const localFrame = frame - startFrame;

  // Quick flash: peak at 20% of duration, then fade out
  const peakFrame = Math.round(durationFrames * 0.2);
  const opacity =
    localFrame <= peakFrame
      ? interpolate(localFrame, [0, peakFrame], [0, maxOpacity], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : interpolate(localFrame, [peakFrame, durationFrames], [maxOpacity, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: color,
        opacity,
        zIndex: 60,
        pointerEvents: 'none',
      }}
    />
  );
};
