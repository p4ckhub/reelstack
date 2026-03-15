import { useCurrentFrame, useVideoConfig, spring, interpolate, random } from 'remotion';
import type { CSSProperties } from 'react';
import type { BaseEffectSegment, EntranceAnimation, ExitAnimation } from '../types';
import { computeLoopStyle } from './useLoopAnimation';

interface EffectAnimationResult {
  readonly visible: boolean;
  readonly style: CSSProperties;
}

function computeEntrance(
  localFrame: number,
  fps: number,
  entrance: EntranceAnimation,
  segmentId: string,
): CSSProperties {
  if (entrance === 'none') return {};

  const springVal = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  switch (entrance) {
    case 'spring-scale':
      return { transform: `scale(${springVal})` };

    case 'pop': {
      const pop = spring({
        frame: localFrame,
        fps,
        config: { damping: 8, stiffness: 200, overshootClamping: false },
      });
      return { transform: `scale(${pop})` };
    }

    case 'bounce': {
      const bounce = spring({
        frame: localFrame,
        fps,
        config: { damping: 6, stiffness: 150, overshootClamping: false },
      });
      return { transform: `scale(${bounce})` };
    }

    case 'fade': {
      const opacity = interpolate(localFrame, [0, Math.round(fps * 0.3)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { opacity };
    }

    case 'slide-up':
      return { transform: `translateY(${(1 - springVal) * 100}%)` };

    case 'slide-down':
      return { transform: `translateY(${-(1 - springVal) * 100}%)` };

    case 'slide-left':
      return { transform: `translateX(${(1 - springVal) * 100}%)` };

    case 'slide-right':
      return { transform: `translateX(${-(1 - springVal) * 100}%)` };

    case 'glitch': {
      const glitchFrames = Math.round(fps * 0.2);
      if (localFrame >= glitchFrames) return {};
      const seed = random(`glitch-entrance-${segmentId}-${localFrame}`);
      const offsetX = (seed - 0.5) * 20;
      const offsetY = (random(`glitch-ey-${segmentId}-${localFrame}`) - 0.5) * 10;
      const skew = (random(`glitch-sk-${segmentId}-${localFrame}`) - 0.5) * 8;
      return {
        transform: `translate(${offsetX}px, ${offsetY}px) skewX(${skew}deg)`,
        filter: localFrame % 2 === 0 ? 'hue-rotate(90deg)' : undefined,
      };
    }

    case 'flip-up':
      return {
        transform: `perspective(400px) rotateX(${(1 - springVal) * -90}deg)`,
        transformOrigin: 'center bottom',
      };

    case 'elastic': {
      const elastic = spring({
        frame: localFrame,
        fps,
        config: { damping: 3, stiffness: 200, overshootClamping: false },
      });
      return { transform: `scaleX(${elastic}) scaleY(${springVal})` };
    }

    case 'zoom-blur': {
      const progress = interpolate(localFrame, [0, Math.round(fps * 0.4)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const scale = interpolate(progress, [0, 1], [3, 1]);
      const blur = interpolate(progress, [0, 1], [10, 0]);
      return {
        transform: `scale(${scale})`,
        filter: `blur(${blur}px)`,
        opacity: progress,
      };
    }

    case 'flicker': {
      const flickerFrames = Math.round(fps * 0.3);
      if (localFrame >= flickerFrames) return { opacity: 1 };
      // Toggle opacity 0/1 rapidly
      const flickerIndex = Math.floor(localFrame / 2);
      return { opacity: flickerIndex % 2 === 0 ? 1 : 0 };
    }

    case 'ink-print': {
      const progress = interpolate(localFrame, [0, Math.round(fps * 0.3)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const blur = interpolate(progress, [0, 1], [8, 0]);
      const scale = interpolate(progress, [0, 0.7, 1], [1.1, 1.02, 1]);
      return {
        transform: `scale(${scale})`,
        filter: `blur(${blur}px)`,
        opacity: progress,
      };
    }

    default:
      return { transform: `scale(${springVal})` };
  }
}

function computeExit(
  localFrame: number,
  durationFrames: number,
  fps: number,
  exit: ExitAnimation,
  segmentId: string,
): CSSProperties {
  if (exit === 'none') return {};

  const exitDuration = Math.round(fps * 0.3);
  const exitStart = durationFrames - exitDuration;

  if (localFrame < exitStart) return {};

  const exitProgress = interpolate(
    localFrame,
    [exitStart, durationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  switch (exit) {
    case 'fade':
      return { opacity: 1 - exitProgress };

    case 'slide-down':
      return { transform: `translateY(${exitProgress * 100}%)` };

    case 'shrink':
    case 'pop-out':
      return { transform: `scale(${1 - exitProgress})` };

    case 'slide-up':
      return { transform: `translateY(${-exitProgress * 100}%)` };

    case 'slide-left':
      return { transform: `translateX(${-exitProgress * 100}%)` };

    case 'scale-blur': {
      const scale = interpolate(exitProgress, [0, 1], [1, 2]);
      const blur = interpolate(exitProgress, [0, 1], [0, 10]);
      return {
        transform: `scale(${scale})`,
        filter: `blur(${blur}px)`,
        opacity: 1 - exitProgress,
      };
    }

    case 'glitch': {
      const seed = random(`glitch-exit-${segmentId}-${localFrame}`);
      const offsetX = (seed - 0.5) * 30 * exitProgress;
      return {
        transform: `translate(${offsetX}px, 0)`,
        opacity: 1 - exitProgress,
        filter: localFrame % 2 === 0 ? 'hue-rotate(180deg)' : undefined,
      };
    }

    default:
      return { opacity: 1 - exitProgress };
  }
}

function mergeStyles(entrance: CSSProperties, exit: CSSProperties): CSSProperties {
  const merged: CSSProperties = { ...entrance };

  // Combine transforms
  if (entrance.transform && exit.transform) {
    merged.transform = `${entrance.transform} ${exit.transform}`;
  } else if (exit.transform) {
    merged.transform = exit.transform;
  }

  // Exit opacity overrides entrance
  if (exit.opacity !== undefined) {
    const entranceOpacity = typeof entrance.opacity === 'number' ? entrance.opacity : 1;
    merged.opacity = entranceOpacity * (exit.opacity as number);
  }

  // Exit filter overrides
  if (exit.filter) {
    merged.filter = exit.filter;
  }

  return merged;
}

export function useEffectAnimation(segment: BaseEffectSegment): EffectAnimationResult {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) {
    return { visible: false, style: {} };
  }

  const localFrame = frame - startFrame;
  const durationFrames = endFrame - startFrame;
  const segmentId = `${segment.type}-${segment.startTime}`;

  const entrance = segment.entrance ?? 'spring-scale';
  const exit = segment.exit ?? 'fade';

  const entranceStyle = computeEntrance(localFrame, fps, entrance, segmentId);
  const exitStyle = computeExit(localFrame, durationFrames, fps, exit, segmentId);
  const loopStyle = segment.loop ? computeLoopStyle(segment.loop, localFrame, fps, segmentId) : {};
  const style = mergeStyles(mergeStyles(entranceStyle, loopStyle), exitStyle);

  return { visible: true, style };
}
