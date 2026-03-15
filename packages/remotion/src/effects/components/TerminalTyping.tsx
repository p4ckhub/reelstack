import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { TerminalTypingEffect } from '../types';

interface Props {
  readonly segment: TerminalTypingEffect;
}

export const TerminalTyping: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    text,
    fontSize = 32,
    fontColor = '#00FF00',
    backgroundColor = '#1E1E1E',
    showCursor = true,
    cursorChar = '▌',
    prompt = '$ ',
    position = 'center',
  } = segment;

  // Calculate typing progress relative to segment start
  const startFrame = Math.round(segment.startTime * fps);
  const durationFrames = (segment.endTime - segment.startTime) * fps;
  const localFrame = frame - startFrame;
  const typingEnd = durationFrames * 0.8;
  const progress = typingEnd > 0 ? Math.min(localFrame / typingEnd, 1) : 1;
  const charsToShow = Math.floor(progress * text.length);
  const displayedText = text.slice(0, charsToShow);

  // Cursor blink: 2Hz (on/off every 0.25s) — use localFrame to stay relative to segment
  const cursorVisible = showCursor && Math.sin((localFrame / fps) * Math.PI * 4) > 0;

  const positionStyle: React.CSSProperties =
    position === 'top'
      ? { top: '10%', left: '50%', transform: 'translateX(-50%)' }
      : position === 'bottom'
        ? { bottom: '10%', left: '50%', transform: 'translateX(-50%)' }
        : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        backgroundColor,
        borderRadius: 12,
        padding: '20px 28px',
        maxWidth: '85%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 35,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <pre
        style={{
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          fontSize,
          color: fontColor,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.4,
        }}
      >
        <span style={{ opacity: 0.6 }}>{prompt}</span>
        {displayedText}
        {cursorVisible && <span style={{ opacity: 0.9 }}>{cursorChar}</span>}
      </pre>
    </div>
  );
};
