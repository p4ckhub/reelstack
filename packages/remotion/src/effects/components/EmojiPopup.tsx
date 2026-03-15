import { useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { EmojiPopupEffect } from '../types';

interface Props {
  readonly segment: EmojiPopupEffect;
}

export const EmojiPopup: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!visible) return null;

  const { emoji, position = { x: 50, y: 30 }, size = 80, rotation = 0 } = segment;

  const startFrame = Math.round(segment.startTime * fps);
  const localFrame = frame - startFrame;

  // Extra wiggle rotation on entrance
  const wiggle = spring({
    frame: localFrame,
    fps,
    config: { damping: 6, stiffness: 120, overshootClamping: false },
  });
  const wiggleRotation = rotation + (1 - wiggle) * 15;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, -50%) rotate(${wiggleRotation}deg)`,
        fontSize: size,
        lineHeight: 1,
        zIndex: 25,
        pointerEvents: 'none',
        ...style,
        // Merge transforms
        ...(style.transform
          ? { transform: `translate(-50%, -50%) rotate(${wiggleRotation}deg) ${style.transform}` }
          : {}),
      }}
    >
      {emoji}
    </div>
  );
};
