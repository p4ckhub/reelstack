import { interpolate } from 'remotion';

export type TransitionType = 'crossfade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'wipe' | 'none';

export function computeEntrance(
  frame: number,
  transitionFrames: number,
  transition: TransitionType,
): { opacity: number; transform: string } {
  if (transition === 'none' || transitionFrames === 0) {
    return { opacity: 1, transform: 'none' };
  }

  const progress = interpolate(frame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  switch (transition) {
    case 'crossfade':
      return { opacity: progress, transform: 'none' };

    case 'slide-left':
      return {
        opacity: 1,
        transform: `translateX(${(1 - progress) * 100}%)`,
      };

    case 'slide-right':
      return {
        opacity: 1,
        transform: `translateX(${-(1 - progress) * 100}%)`,
      };

    case 'zoom-in': {
      const scale = interpolate(progress, [0, 1], [1.3, 1]);
      return { opacity: progress, transform: `scale(${scale})` };
    }

    case 'wipe':
      return {
        opacity: 1,
        transform: `translateX(${-(1 - progress) * 100}%)`,
      };

    default:
      return { opacity: 1, transform: 'none' };
  }
}
