import { useCurrentFrame, useVideoConfig, spring, interpolate, OffthreadVideo } from 'remotion';
import type { PipSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface PictureInPictureProps {
  readonly segment: PipSegment;
}

const MARGIN = 3; // % from edge

export const PictureInPicture: React.FC<PictureInPictureProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  // Not visible outside time range
  if (frame < startFrame || frame > endFrame) return null;

  const {
    position = 'bottom-right',
    size = 30,
    shape = 'circle',
    borderColor = '#FFFFFF',
    borderWidth = 3,
  } = segment;

  // Entrance spring — only on first appearance
  const ENTRANCE_FRAMES = Math.round(0.4 * fps);
  const entryScale =
    frame - startFrame < ENTRANCE_FRAMES
      ? spring({ frame: frame - startFrame, fps, config: { damping: 12, stiffness: 180 } })
      : 1;

  // Exit fade (last 0.3s)
  const exitFadeDuration = Math.round(0.3 * fps);
  const exitOpacity = interpolate(frame, [endFrame - exitFadeDuration, endFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pixelWidth = (size / 100) * width;
  const pixelHeight = shape === 'circle' ? pixelWidth : pixelWidth * 1.33; // 3:4 portrait ratio
  const borderRadius = shape === 'circle' ? '50%' : shape === 'rounded' ? 24 : 0;

  // Positions designed around social media safe zones:
  // - Right edge: TikTok/IG has like/comment/share buttons (~15% from right)
  // - Bottom edge: description text, progress bar (~20% from bottom)
  // - Left edge: generally safe
  const positionStyle: React.CSSProperties = {};
  if (position === 'bottom-center') {
    positionStyle.bottom = '18%';
    positionStyle.left = `${(100 - size) / 2}%`;
  } else if (position === 'bottom-right') {
    // Chuck-style: center-right, above social media UI
    positionStyle.bottom = '18%';
    positionStyle.right = '5%';
  } else {
    if (position.includes('top')) positionStyle.top = `${MARGIN}%`;
    if (position.includes('bottom')) positionStyle.bottom = '18%';
    if (position.includes('left')) positionStyle.left = `${MARGIN}%`;
    if (position.includes('right')) positionStyle.right = '5%';
  }

  const videoElement = (
    <OffthreadVideo
      muted
      src={resolveMediaUrl(segment.videoUrl)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        width: pixelWidth,
        height: pixelHeight,
        borderRadius,
        border: `${borderWidth}px solid ${borderColor}`,
        overflow: 'hidden',
        transform: `scale(${entryScale})`,
        opacity: exitOpacity,
        zIndex: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {videoElement}
    </div>
  );
};
