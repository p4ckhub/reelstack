import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { CircularCounterEffect } from '../types';

interface Props {
  readonly segment: CircularCounterEffect;
}

export const CircularCounter: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!visible) return null;

  const {
    segments: counterSegments,
    size = 200,
    trackColor = '#333333',
    fillColor = '#3B82F6',
    textColor = '#FFFFFF',
    fontSize = 48,
    strokeWidth = 10,
    position = 'center',
  } = segment;

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);
  const totalFrames = endFrame - startFrame;
  const localFrame = frame - startFrame;

  // Calculate current value based on segments with holds
  // Each segment: animate to value, then optionally hold
  let currentValue = 0;
  let framesSoFar = 0;
  const maxValue = counterSegments[counterSegments.length - 1]?.value ?? 100;

  // Distribute frames across segments
  const totalHoldFrames = counterSegments.reduce((sum, s) => sum + (s.holdFrames ?? 0), 0);
  const animFrames = totalFrames - totalHoldFrames;
  const segCount = counterSegments.length;

  let prevValue = 0;
  for (let i = 0; i < segCount; i++) {
    const seg = counterSegments[i];
    const animDuration = Math.round(animFrames / segCount);
    const holdDuration = seg.holdFrames ?? 0;

    if (localFrame < framesSoFar + animDuration) {
      // Currently animating to this segment's value
      const progress = interpolate(localFrame, [framesSoFar, framesSoFar + animDuration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      // Ease in-out
      const eased = progress * progress * (3 - 2 * progress);
      currentValue = prevValue + (seg.value - prevValue) * eased;
      break;
    }
    framesSoFar += animDuration;

    if (localFrame < framesSoFar + holdDuration) {
      // Holding at this value
      currentValue = seg.value;
      break;
    }
    framesSoFar += holdDuration;
    prevValue = seg.value;
    currentValue = seg.value;
  }

  // SVG circular progress
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = currentValue / maxValue;
  const dashOffset = circumference * (1 - progress);

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 44,
    pointerEvents: 'none',
  };

  switch (position) {
    case 'top-right':
      positionStyle.top = '8%';
      positionStyle.right = '5%';
      break;
    case 'top-left':
      positionStyle.top = '8%';
      positionStyle.left = '5%';
      break;
    case 'bottom-right':
      positionStyle.bottom = '15%';
      positionStyle.right = '5%';
      break;
    case 'bottom-left':
      positionStyle.bottom = '15%';
      positionStyle.left = '5%';
      break;
    default: // center
      positionStyle.top = '50%';
      positionStyle.left = '50%';
      positionStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <div style={{ ...positionStyle, ...style }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 8px ${fillColor})` }}
        />
      </svg>
      {/* Center value */}
      <div
        style={{
          position: 'absolute',
          fontSize,
          fontWeight: 700,
          fontFamily: 'Outfit, sans-serif',
          color: textColor,
          textShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}
      >
        {Math.round(currentValue)}
      </div>
    </div>
  );
};
