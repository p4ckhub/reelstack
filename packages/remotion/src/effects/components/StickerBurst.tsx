import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { StickerBurstEffect } from '../types';

interface Props {
  readonly segment: StickerBurstEffect;
}

const DEFAULT_COLORS = ['#FF6B35', '#4ECDC4', '#FFE66D', '#FF6B9D', '#A29BFE'];
const DEFAULT_SHAPES = ['burst', 'sparkle', 'diamond', 'star'] as const;

// Deterministic layout: spread across screen height, anchored to the side
const POSITION_PRESETS = [
  { y: 18, size: 72, rotOffset: -15 },
  { y: 48, size: 58, rotOffset: 10 },
  { y: 74, size: 66, rotOffset: -8 },
  { y: 32, size: 50, rotOffset: 20 },
  { y: 62, size: 62, rotOffset: -5 },
];

// X offset from the side edge (% of screen width)
const SIDE_X = [12, 8, 16, 6, 20];

function BurstShape({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, i) => (
        <line
          key={i}
          x1="50"
          y1="50"
          x2="50"
          y2="10"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          transform={`rotate(${deg}, 50, 50)`}
        />
      ))}
    </svg>
  );
}

function SparkleShape({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100">
      {/* 4-point sparkle star */}
      <path
        d="M50,5 C50,45 50,45 95,50 C50,55 50,55 50,95 C50,55 50,55 5,50 C50,45 50,45 50,5 Z"
        fill={color}
      />
    </svg>
  );
}

function DiamondShape({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100">
      <rect x="18" y="18" width="64" height="64" fill={color} transform="rotate(45 50 50)" rx="4" />
    </svg>
  );
}

function StarShape({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100">
      <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill={color} />
    </svg>
  );
}

function renderShape(shape: string, color: string) {
  switch (shape) {
    case 'sparkle':
      return <SparkleShape color={color} />;
    case 'diamond':
      return <DiamondShape color={color} />;
    case 'star':
      return <StarShape color={color} />;
    default:
      return <BurstShape color={color} />;
  }
}

export const StickerBurst: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const localFrame = frame - startFrame;
  const durationFrames = endFrame - startFrame;

  const { side = 'left', count = 3, colors = DEFAULT_COLORS, shapes = DEFAULT_SHAPES } = segment;

  // Global fade-out in the last 30% of duration
  const exitStart = durationFrames * 0.7;
  const globalOpacity = interpolate(localFrame, [exitStart, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: count }).map((_, i) => {
        const preset = POSITION_PRESETS[i % POSITION_PRESETS.length];
        const xOffset = SIDE_X[i % SIDE_X.length];

        // Stagger: each element starts 3 frames later
        const staggerFrames = i * 3;
        const localF = Math.max(0, localFrame - staggerFrames);

        const springVal = spring({
          frame: localF,
          fps,
          config: { damping: 10, stiffness: 220, overshootClamping: false },
        });

        // Slide in from the side
        const direction = side === 'left' ? -1 : 1;
        const enterX = direction * (1 - springVal) * 130;

        // Slight overshoot rotation
        const rot = preset.rotOffset + (1 - springVal) * 25 * direction;

        const x = side === 'left' ? xOffset : 100 - xOffset;
        const color = colors[i % colors.length];
        const shape = shapes[i % shapes.length];

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${preset.y}%`,
              width: preset.size,
              height: preset.size,
              transform: `translate(-50%, -50%) translateX(${enterX}px) rotate(${rot}deg)`,
              opacity: globalOpacity,
              willChange: 'transform',
            }}
          >
            {renderShape(shape as string, color)}
          </div>
        );
      })}
    </div>
  );
};
