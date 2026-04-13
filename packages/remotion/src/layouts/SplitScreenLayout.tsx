import { OffthreadVideo, useVideoConfig } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface SplitScreenLayoutProps {
  readonly primaryVideoUrl?: string;
  readonly secondaryVideoUrl?: string;
  readonly dividerColor?: string;
}

/**
 * Split-screen 9:16 layout: top half = secondary (screen recording/demo),
 * bottom half = primary (talking head).
 */
export const SplitScreenLayout: React.FC<SplitScreenLayoutProps> = ({
  primaryVideoUrl,
  secondaryVideoUrl,
  dividerColor = '#00d4ff',
}) => {
  const { width, height } = useVideoConfig();
  const halfHeight = height / 2;

  return (
    <>
      {/* Top half: Screen recording / demo */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: halfHeight,
          backgroundColor: '#16213e',
          overflow: 'hidden',
        }}
      >
        {secondaryVideoUrl ? (
          <OffthreadVideo
            muted
            src={resolveMediaUrl(secondaryVideoUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <PlaceholderPanel label="SCREEN RECORDING" color="#4a9eff" />
        )}
      </div>

      {/* Bottom half: Talking head */}
      <div
        style={{
          position: 'absolute',
          top: halfHeight,
          left: 0,
          width,
          height: halfHeight,
          backgroundColor: '#1a1a2e',
          overflow: 'hidden',
        }}
      >
        {primaryVideoUrl ? (
          <OffthreadVideo
            muted
            src={resolveMediaUrl(primaryVideoUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <PlaceholderPanel label="TALKING HEAD" color="#8a8aaa" />
        )}
      </div>

      {/* Divider line */}
      <div
        style={{
          position: 'absolute',
          top: halfHeight - 2,
          left: 0,
          width,
          height: 4,
          backgroundColor: dividerColor,
          opacity: 0.6,
        }}
      />
    </>
  );
};

const PlaceholderPanel: React.FC<{ label: string; color: string }> = ({ label, color }) => (
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
        fontSize: 28,
        color,
        fontFamily: 'monospace',
        letterSpacing: 2,
        opacity: 0.5,
      }}
    >
      {label}
    </div>
  </div>
);
