import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { LowerThirdSegment } from '@reelstack/types';

interface LowerThirdProps {
  readonly segment: LowerThirdSegment;
}

export const LowerThird: React.FC<LowerThirdProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const {
    title,
    subtitle,
    backgroundColor = '#000000CC',
    textColor = '#FFFFFF',
    position = 'left',
    accentColor = '#3B82F6',
  } = segment;

  // Slide in from left
  const slideProgress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  // Exit fade (last 0.4s)
  const exitDuration = Math.round(0.4 * fps);
  const exitOpacity = interpolate(frame, [endFrame - exitDuration, endFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const translateX = (1 - slideProgress) * -120;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12%',
        left: position === 'left' ? '5%' : '50%',
        transform:
          position === 'center'
            ? `translateX(calc(-50% + ${translateX}%))`
            : `translateX(${translateX}%)`,
        display: 'flex',
        alignItems: 'stretch',
        opacity: exitOpacity,
        zIndex: 10,
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          width: 5,
          backgroundColor: accentColor,
          borderRadius: '3px 0 0 3px',
          transform: `scaleY(${slideProgress})`,
        }}
      />
      {/* Content */}
      <div
        style={{
          backgroundColor,
          padding: '14px 24px',
          borderRadius: '0 8px 8px 0',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            color: textColor,
            fontSize: 28,
            fontWeight: 'bold',
            fontFamily: 'Outfit, sans-serif',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              color: textColor,
              fontSize: 18,
              fontFamily: 'Inter, sans-serif',
              opacity: 0.8,
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
