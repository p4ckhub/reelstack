import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { CtaSegment } from '@reelstack/types';

interface CtaOverlayProps {
  readonly segment: CtaSegment;
}

export const CtaOverlay: React.FC<CtaOverlayProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const {
    text,
    style: ctaStyle = 'button',
    backgroundColor = '#3B82F6',
    textColor = '#FFFFFF',
    position = 'bottom',
    icon,
  } = segment;

  // Bounce entrance
  const entryScale = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 8, stiffness: 200, overshootClamping: false },
  });

  // Subtle pulse after entry settles (loop every 60 frames)
  const settled = frame - startFrame > fps; // after 1 second
  const pulseFrame = settled ? (frame - startFrame - fps) % 60 : 0;
  const pulse = settled
    ? interpolate(pulseFrame, [0, 30, 60], [1, 1.04, 1], { extrapolateRight: 'clamp' })
    : 1;

  // Exit fade
  const exitDuration = Math.round(0.3 * fps);
  const exitOpacity = interpolate(frame, [endFrame - exitDuration, endFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const positionStyle: React.CSSProperties = {};
  if (position === 'bottom') positionStyle.bottom = '15%';
  if (position === 'center') {
    positionStyle.top = '50%';
    positionStyle.transform = 'translateY(-50%)';
  }
  if (position === 'top') positionStyle.top = '15%';

  const displayText = icon ? `${icon} ${text}` : text;

  if (ctaStyle === 'banner') {
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          ...positionStyle,
          display: 'flex',
          justifyContent: 'center',
          opacity: exitOpacity,
          zIndex: 20,
        }}
      >
        <div
          style={{
            backgroundColor,
            color: textColor,
            padding: '16px 40px',
            fontSize: 32,
            fontWeight: 'bold',
            fontFamily: 'Outfit, sans-serif',
            textAlign: 'center',
            width: '90%',
            borderRadius: 12,
            transform: `scale(${entryScale * pulse})`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          {displayText}
        </div>
      </div>
    );
  }

  // Button or pill style
  const borderRadius = ctaStyle === 'pill' ? 100 : 16;
  const paddingH = ctaStyle === 'pill' ? 40 : 32;
  const fontSize = ctaStyle === 'pill' ? 24 : 32;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        ...positionStyle,
        display: 'flex',
        justifyContent: 'center',
        opacity: exitOpacity,
        zIndex: 20,
      }}
    >
      <div
        style={{
          backgroundColor,
          color: textColor,
          padding: `14px ${paddingH}px`,
          fontSize,
          fontWeight: 'bold',
          fontFamily: 'Outfit, sans-serif',
          borderRadius,
          transform: `scale(${entryScale * pulse})`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          display: 'inline-block',
        }}
      >
        {displayText}
      </div>
    </div>
  );
};
