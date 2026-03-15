import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

interface Segment {
  startTime: number;
  endTime: number;
}

interface SegmentedProgressBarProps {
  /** Segments (clips/tips) with timing */
  readonly segments: readonly Segment[];
  /** Bar color (default: white) */
  readonly color?: string;
  /** Active segment fill color (default: same as color) */
  readonly activeColor?: string;
  /** Background color of unfilled segments (default: rgba(255,255,255,0.25)) */
  readonly bgColor?: string;
  /** Height in px (default: 3) */
  readonly height?: number;
  /** Margin from top edge in px (default: 16) */
  readonly top?: number;
  /** Horizontal padding in px (default: 16) */
  readonly horizontalPadding?: number;
  /** Gap between segments in px (default: 4) */
  readonly gap?: number;
}

/**
 * Instagram Stories-style segmented progress bar.
 * Shows N segments at the top — completed ones filled, current one animating, upcoming dimmed.
 * Only renders when there are 2+ segments.
 */
export const SegmentedProgressBar: React.FC<SegmentedProgressBarProps> = ({
  segments,
  color = '#FFFFFF',
  activeColor,
  bgColor = 'rgba(255, 255, 255, 0.25)',
  height = 3,
  top = 16,
  horizontalPadding = 16,
  gap = 4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (segments.length < 2) return null;

  const fillColor = activeColor ?? color;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: horizontalPadding,
        right: horizontalPadding,
        display: 'flex',
        gap,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {segments.map((seg, i) => {
        const segDuration = seg.endTime - seg.startTime;
        let fillPercent: number;

        if (currentTime >= seg.endTime) {
          // Completed
          fillPercent = 100;
        } else if (currentTime >= seg.startTime) {
          // Active — fill proportionally
          fillPercent = ((currentTime - seg.startTime) / segDuration) * 100;
        } else {
          // Upcoming
          fillPercent = 0;
        }

        return (
          <div
            key={i}
            style={{
              flex: segDuration, // width proportional to duration
              height,
              borderRadius: height / 2,
              backgroundColor: bgColor,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${fillPercent}%`,
                backgroundColor: fillColor,
                borderRadius: height / 2,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
