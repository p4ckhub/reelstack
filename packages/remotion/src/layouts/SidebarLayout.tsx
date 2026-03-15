import { OffthreadVideo, useVideoConfig } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface SidebarLayoutProps {
  readonly mainVideoUrl?: string;
  readonly webcamVideoUrl?: string;
  readonly sidebarPosition?: 'left' | 'right';
  readonly sidebarWidth?: number; // % default 30
}

/**
 * Sidebar layout for YouTube: main content (screen/demo) + webcam in sidebar.
 * Common in tech tutorials (NetworkChuck, Fireship style).
 */
export const SidebarLayout: React.FC<SidebarLayoutProps> = ({
  mainVideoUrl,
  webcamVideoUrl,
  sidebarPosition = 'right',
  sidebarWidth = 30,
}) => {
  const { width, height } = useVideoConfig();
  const sidebarPx = Math.round((sidebarWidth / 100) * width);
  const mainPx = width - sidebarPx;

  const mainStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    [sidebarPosition === 'right' ? 'left' : 'right']: 0,
    width: mainPx,
    height,
    overflow: 'hidden',
    backgroundColor: '#0F0F0F',
  };

  const sidebarStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    [sidebarPosition]: 0,
    width: sidebarPx,
    height,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    boxShadow: sidebarPosition === 'right'
      ? '-4px 0 20px rgba(0,0,0,0.5)'
      : '4px 0 20px rgba(0,0,0,0.5)',
  };

  return (
    <>
      {/* Main content area */}
      <div style={mainStyle}>
        {mainVideoUrl ? (
          <OffthreadVideo
            muted
            src={resolveMediaUrl(mainVideoUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Placeholder label="MAIN CONTENT" />
        )}
      </div>

      {/* Webcam sidebar */}
      <div style={sidebarStyle}>
        {webcamVideoUrl ? (
          <OffthreadVideo
            muted
            src={resolveMediaUrl(webcamVideoUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Placeholder label="WEBCAM" />
        )}
      </div>
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
