import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { SplitScreenDividerEffect } from '../types';

interface Props {
  readonly segment: SplitScreenDividerEffect;
}

export const SplitScreenDivider: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const {
    dividerColor = '#FFFFFF',
    dividerWidth = 4,
    direction = 'horizontal',
    animationSpeed = 1,
  } = segment;

  const localFrame = frame - startFrame;
  const durationFrames = endFrame - startFrame;

  // Entrance: halves slide apart
  const entranceDuration = Math.round((fps * 0.4) / animationSpeed);
  const entranceProgress = interpolate(localFrame, [0, entranceDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Exit: halves slide back
  const exitDuration = Math.round(fps * 0.3);
  const exitProgress = interpolate(
    localFrame,
    [durationFrames - exitDuration, durationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const slideAmount = (entranceProgress - exitProgress) * 8;

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 12,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Top/Left half offset */}
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal
            ? {
                top: 0,
                left: 0,
                right: 0,
                height: '50%',
                transform: `translateY(${-slideAmount}px)`,
              }
            : {
                top: 0,
                left: 0,
                bottom: 0,
                width: '50%',
                transform: `translateX(${-slideAmount}px)`,
              }),
        }}
      />

      {/* Divider line */}
      <div
        style={{
          position: 'absolute',
          backgroundColor: dividerColor,
          boxShadow: `0 0 20px ${dividerColor}`,
          ...(isHorizontal
            ? { top: '50%', left: 0, right: 0, height: dividerWidth, transform: 'translateY(-50%)' }
            : {
                left: '50%',
                top: 0,
                bottom: 0,
                width: dividerWidth,
                transform: 'translateX(-50%)',
              }),
          opacity: entranceProgress * (1 - exitProgress),
        }}
      />

      {/* Bottom/Right half offset */}
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal
            ? {
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                transform: `translateY(${slideAmount}px)`,
              }
            : {
                right: 0,
                top: 0,
                bottom: 0,
                width: '50%',
                transform: `translateX(${slideAmount}px)`,
              }),
        }}
      />
    </div>
  );
};
