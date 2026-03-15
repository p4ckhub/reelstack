import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { HighlightSegment } from '@reelstack/types';

interface HighlightBoxProps {
  readonly segment: HighlightSegment;
}

/**
 * Colored rectangle highlight on a region of the screen.
 * NetworkChuck style: red boxes on code. MKBHD: rounded frames on products.
 */
export const HighlightBox: React.FC<HighlightBoxProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const {
    x,
    y,
    width,
    height,
    color = '#FF0000',
    borderWidth = 3,
    borderRadius = 8,
    label,
    glow = false,
    style = 'border',
  } = segment;

  const isMarker = style === 'marker';

  // Spring entrance
  const entryScale = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  // Exit fade
  const exitDuration = Math.round(0.3 * fps);
  const exitOpacity = interpolate(
    frame,
    [endFrame - exitDuration, endFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        border: isMarker ? 'none' : `${borderWidth}px solid ${color}`,
        borderRadius: isMarker ? 2 : borderRadius,
        backgroundColor: isMarker ? `${color}40` : undefined,
        opacity: exitOpacity,
        transform: `scale(${0.85 + entryScale * 0.15})`,
        transformOrigin: 'center center',
        boxShadow: glow ? `0 0 20px ${color}, 0 0 40px ${color}44` : 'none',
        zIndex: 12,
        pointerEvents: 'none',
      }}
    >
      {label && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: 0,
            color,
            fontSize: 16,
            fontWeight: 'bold',
            fontFamily: 'Inter, sans-serif',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: '2px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            opacity: entryScale,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
