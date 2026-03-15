import { AbsoluteFill, Img } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';

export interface LogoOverlayConfig {
  /** Logo image URL (PNG with transparency recommended) */
  url: string;
  /** Position on screen */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center';
  /** Size as % of viewport width (default: 12) */
  size?: number;
  /** Opacity 0-1 (default: 0.8) */
  opacity?: number;
  /** Margin from edge as % (default: 4) */
  margin?: number;
}

/**
 * Persistent logo/watermark overlay.
 * Renders on top of all content layers, visible throughout the entire reel.
 */
export const LogoOverlay: React.FC<{ readonly config: LogoOverlayConfig }> = ({ config }) => {
  const { url, position = 'top-right', size = 12, opacity = 0.8, margin = 4 } = config;

  if (!url) return null;

  const positionStyle: React.CSSProperties = {};
  if (position.includes('top')) positionStyle.top = `${margin}%`;
  if (position.includes('bottom')) positionStyle.bottom = `${margin}%`;
  if (position.includes('left')) positionStyle.left = `${margin}%`;
  if (position.includes('right')) positionStyle.right = `${margin}%`;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <Img
        src={resolveMediaUrl(url)}
        style={{
          position: 'absolute',
          ...positionStyle,
          width: `${size}%`,
          height: 'auto',
          opacity,
          objectFit: 'contain',
        }}
      />
    </AbsoluteFill>
  );
};
