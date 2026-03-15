import { OffthreadVideo, useVideoConfig } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface HorizontalSplitLayoutProps {
  readonly leftVideoUrl?: string;
  readonly rightVideoUrl?: string;
  readonly dividerColor?: string;
}

/**
 * Horizontal 50/50 split for YouTube: left + right side by side.
 * For comparisons, dual-speaker, before/after.
 */
export const HorizontalSplitLayout: React.FC<HorizontalSplitLayoutProps> = ({
  leftVideoUrl,
  rightVideoUrl,
  dividerColor = '#333',
}) => {
  const { width, height } = useVideoConfig();
  const halfWidth = width / 2;

  return (
    <>
      {/* Left half */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: halfWidth,
          height,
          overflow: 'hidden',
          backgroundColor: '#0F0F0F',
        }}
      >
        {leftVideoUrl ? (
          <OffthreadVideo
            muted
            src={resolveMediaUrl(leftVideoUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Placeholder label="LEFT" />
        )}
      </div>

      {/* Right half */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: halfWidth,
          width: halfWidth,
          height,
          overflow: 'hidden',
          backgroundColor: '#0F0F0F',
        }}
      >
        {rightVideoUrl ? (
          <OffthreadVideo
            muted
            src={resolveMediaUrl(rightVideoUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Placeholder label="RIGHT" />
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: halfWidth - 1,
          width: 2,
          height,
          backgroundColor: dividerColor,
          opacity: 0.4,
        }}
      />
    </>
  );
};

const Placeholder: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
    }}
  >
    <div
      style={{
        fontSize: 24,
        color: '#666',
        fontFamily: 'monospace',
        letterSpacing: 2,
        opacity: 0.5,
      }}
    >
      {label}
    </div>
  </div>
);
