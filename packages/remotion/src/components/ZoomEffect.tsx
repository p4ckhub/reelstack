import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import type { ZoomSegment } from '@reelstack/types';

interface ZoomEffectProps {
  readonly segment: ZoomSegment;
  readonly children: React.ReactNode;
}

/**
 * Zoom effect with professional easing curves.
 *
 * Easing modes:
 * - 'smooth': S-curve ease-in-out (~0.3s) — standard professional transition
 * - 'slow': Cinematic S-curve (~0.5s) — dramatic moments, slower build
 * - 'spring': Overshoot + settle (~0.3s) — energetic, bouncy feel
 * - 'instant': Hard jump cut — no animation
 */
export const ZoomEffect: React.FC<ZoomEffectProps> = ({ segment, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);
  const segmentDuration = endFrame - startFrame;

  if (frame < startFrame || frame > endFrame) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const { scale = 1.5, focusPoint = { x: 50, y: 50 }, easing = 'smooth' } = segment;

  let currentScale: number;

  if (easing === 'instant') {
    currentScale = scale;
  } else {
    // S-curve (ease-in-out) bezier — the "professional" feel
    // Matches: slow start → accelerate → decelerate → smooth stop
    const sCurve = Easing.bezier(0.4, 0, 0.2, 1); // Material Design standard
    const sCurveDramatic = Easing.bezier(0.6, 0, 0.1, 1); // Slower start, snappier end

    const isSlow = easing === 'slow';
    const isSpring = easing === 'spring';

    // Entrance duration
    const entranceSec = isSlow ? 0.5 : isSpring ? 0.3 : 0.3;
    const exitSec = isSlow ? 0.4 : 0.25;

    const maxEntrance = Math.floor(segmentDuration * 0.45);
    const maxExit = Math.floor(segmentDuration * 0.4);
    const entranceFrames = Math.min(Math.round(entranceSec * fps), maxEntrance);
    const exitFrames = Math.min(Math.round(exitSec * fps), maxExit);

    // Select easing curve per mode
    const entranceEasing = isSpring
      ? Easing.out(Easing.back(1.3)) // overshoot + settle back
      : isSlow
        ? sCurveDramatic // dramatic S-curve
        : sCurve; // standard S-curve

    const exitEasing = isSlow ? sCurveDramatic : sCurve;

    // Entrance: scale from 1.0 → target
    const entranceProgress = interpolate(frame, [startFrame, startFrame + entranceFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: entranceEasing,
    });

    // Exit: scale from target → 1.0
    const exitProgress = interpolate(frame, [endFrame - exitFrames, endFrame], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: exitEasing,
    });

    const combined = Math.min(entranceProgress, exitProgress);
    currentScale = interpolate(combined, [0, 1], [1, scale]);
  }

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${currentScale})`,
        transformOrigin: `${focusPoint.x}% ${focusPoint.y}%`,
        overflow: 'hidden',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
