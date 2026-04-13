import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { CounterSegment } from '@reelstack/types';

interface AnimatedCounterProps {
  readonly segment: CounterSegment;
}

function formatNumber(n: number, format: 'full' | 'abbreviated'): string {
  if (format === 'abbreviated') {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString('en-US');
}

/**
 * Animated counter that counts from 0 to target value.
 * MrBeast style: "$1,000,000" counting up with spring overshoot.
 */
export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const {
    value,
    prefix = '',
    suffix = '',
    format = 'full',
    textColor = '#FFFFFF',
    fontSize = 72,
    position = 'center',
    mode = 'count-up',
  } = segment;

  const isCountdown = mode === 'countdown';

  // Count up animation — takes 70% of duration, rest holds at final value
  const countDuration = Math.round((endFrame - startFrame) * 0.7);
  const countProgress = interpolate(frame, [startFrame, startFrame + countDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Spring overshoot at the end
  const settleSpring = spring({
    frame: Math.max(0, frame - startFrame - countDuration + Math.round(fps * 0.3)),
    fps,
    config: { damping: 8, stiffness: 100, overshootClamping: false },
  });

  // Eased count with slight overshoot feel
  const easedCount = countProgress * countProgress * (3 - 2 * countProgress); // smoothstep
  const currentValue = isCountdown
    ? Math.round((1 - easedCount) * value)
    : Math.round(easedCount * value);
  const displayValue = `${prefix}${formatNumber(currentValue, format)}${suffix}`;

  // Entrance scale
  const entryScale = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  // Exit fade
  const exitDuration = Math.round(0.3 * fps);
  const exitOpacity = interpolate(frame, [endFrame - exitDuration, endFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Final scale pulse when count completes
  const finalScale = countProgress >= 1 ? 1 + (settleSpring - 1) * 0.08 : 1;

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
  };
  if (position === 'top') positionStyle.top = '15%';
  if (position === 'center') {
    positionStyle.top = '50%';
    positionStyle.transform = 'translateY(-50%)';
  }
  if (position === 'bottom') positionStyle.bottom = '15%';

  return (
    <div
      style={{
        ...positionStyle,
        opacity: exitOpacity,
        zIndex: 15,
      }}
    >
      <div
        style={{
          color: textColor,
          fontSize,
          fontWeight: 'bold',
          fontFamily: isCountdown
            ? '"JetBrains Mono", "Fira Code", monospace'
            : 'Outfit, sans-serif',
          transform: `scale(${entryScale * finalScale})`,
          textShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        {displayValue}
      </div>
    </div>
  );
};
