import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { ChapterSegment } from '@reelstack/types';

interface ChapterCardProps {
  readonly segment: ChapterSegment;
}

/**
 * Chapter title card. Two styles:
 * - fullscreen: fills entire frame (Fireship-style colored cards)
 * - overlay: semi-transparent bar at bottom (less intrusive)
 */
export const ChapterCard: React.FC<ChapterCardProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const {
    number,
    title,
    subtitle,
    style: cardStyle = 'fullscreen',
    backgroundColor = '#0F0F0F',
    accentColor = '#3B82F6',
  } = segment;

  const entryScale = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 150 },
  });

  // Exit fade in last 0.3s
  const exitDuration = Math.round(0.3 * fps);
  const exitOpacity = interpolate(frame, [endFrame - exitDuration, endFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (cardStyle === 'overlay') {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          padding: '60px 48px 40px',
          opacity: exitOpacity,
          transform: `translateY(${(1 - entryScale) * 40}px)`,
        }}
      >
        {number != null && (
          <div
            style={{
              color: accentColor,
              fontSize: 20,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              marginBottom: 8,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            Chapter {number}
          </div>
        )}
        <div
          style={{
            color: '#FFFFFF',
            fontSize: 42,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 'bold',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              color: '#FFFFFFBB',
              fontSize: 22,
              fontFamily: 'Inter, sans-serif',
              marginTop: 8,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    );
  }

  // Fullscreen chapter card
  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: exitOpacity,
      }}
    >
      {/* Accent line */}
      <div
        style={{
          width: 80,
          height: 4,
          backgroundColor: accentColor,
          borderRadius: 2,
          marginBottom: 32,
          transform: `scaleX(${entryScale})`,
        }}
      />

      {number != null && (
        <div
          style={{
            color: accentColor,
            fontSize: 24,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            marginBottom: 16,
            letterSpacing: 4,
            textTransform: 'uppercase',
            opacity: entryScale,
          }}
        >
          Chapter {number}
        </div>
      )}

      <div
        style={{
          color: '#FFFFFF',
          fontSize: 64,
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 'bold',
          textAlign: 'center',
          lineHeight: 1.2,
          padding: '0 10%',
          transform: `scale(${0.85 + entryScale * 0.15}) translateY(${(1 - entryScale) * 20}px)`,
        }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          style={{
            color: '#FFFFFF99',
            fontSize: 28,
            fontFamily: 'Inter, sans-serif',
            marginTop: 16,
            opacity: entryScale,
            transform: `translateY(${(1 - entryScale) * 15}px)`,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
