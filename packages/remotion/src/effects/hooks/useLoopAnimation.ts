import type { CSSProperties } from 'react';
import { random } from 'remotion';
import type { LoopAnimation } from '../types';

/**
 * Computes CSS properties for a continuous loop animation.
 * Applied between entrance and exit — runs for the entire visible duration.
 */
export function computeLoopStyle(
  loop: LoopAnimation,
  frame: number,
  fps: number,
  segmentId: string,
): CSSProperties {
  if (loop === 'none') return {};

  const t = frame / fps; // time in seconds

  switch (loop) {
    case 'pulse':
      return { transform: `scale(${1 + 0.05 * Math.sin(t * Math.PI * 2)})` };

    case 'shake': {
      const sx = (random(`shake-x-${segmentId}-${frame}`) - 0.5) * 6;
      const sy = (random(`shake-y-${segmentId}-${frame}`) - 0.5) * 6;
      return { transform: `translate(${sx}px, ${sy}px)` };
    }

    case 'swing':
      return {
        transform: `rotate(${Math.sin(t * Math.PI * 1.5) * 5}deg)`,
        transformOrigin: 'top center',
      };

    case 'neon-pulse': {
      const glow = 0.7 + 0.3 * Math.sin(t * Math.PI * 3);
      const hexAlpha = Math.round(glow * 255).toString(16).padStart(2, '0');
      return {
        textShadow: `0 0 10px #ffffff, 0 0 30px #ffffff${hexAlpha}, 0 0 60px #ffffff${hexAlpha}`,
      };
    }

    case 'float': {
      const y = Math.sin(t * Math.PI * 1.2) * 8;
      const rot = Math.sin(t * Math.PI * 0.8) * 2;
      return { transform: `translateY(${y}px) rotate(${rot}deg)` };
    }

    case 'color-cycle':
      return { filter: `hue-rotate(${(frame * 3) % 360}deg)` };

    // 'wave' is per-character — handled in component, not here
    case 'wave':
      return {};

    default:
      return {};
  }
}
