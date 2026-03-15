import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { ProgressRingEffect } from '../types';

interface Props {
  readonly segment: ProgressRingEffect;
}

const POSITION_MAP: Record<string, React.CSSProperties> = {
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'top-right': { top: '8%', right: '8%' },
  'top-left': { top: '8%', left: '8%' },
  'bottom-right': { bottom: '8%', right: '8%' },
  'bottom-left': { bottom: '8%', left: '8%' },
};

/**
 * Animated SVG progress ring that fills from 0% to targetPercent.
 * Uses strokeDasharray/strokeDashoffset animation.
 */
export const ProgressRing: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style: animStyle } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    targetPercent,
    size = 200,
    strokeWidth = 12,
    trackColor = '#333333',
    fillColor = '#3B82F6',
    label,
    labelFontSize = 48,
    labelColor = '#FFFFFF',
    position = 'center',
  } = segment;

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);
  const durationFrames = endFrame - startFrame;
  const localFrame = frame - startFrame;

  // Animate from 0 to targetPercent over 70% of duration, hold rest
  const fillFrame = Math.round(durationFrames * 0.7);
  const currentPercent = interpolate(localFrame, [0, fillFrame], [0, targetPercent], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - currentPercent / 100);

  const displayLabel = label ?? `${Math.round(currentPercent)}%`;

  return (
    <div
      style={{
        position: 'absolute',
        ...POSITION_MAP[position],
        zIndex: 45,
        pointerEvents: 'none',
        ...animStyle,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* Label */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={labelColor}
          fontSize={labelFontSize}
          fontFamily="Outfit, sans-serif"
          fontWeight={700}
        >
          {displayLabel}
        </text>
      </svg>
    </div>
  );
};
