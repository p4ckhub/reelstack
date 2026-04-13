import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import type { TextCardConfig } from '@reelstack/types';

interface TextCardOverlayProps {
  readonly config: TextCardConfig;
  readonly startFrame: number;
}

export const TextCardOverlay: React.FC<TextCardOverlayProps> = ({ config, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const {
    headline,
    subtitle,
    background,
    textColor = '#FFFFFF',
    textAlign = 'center',
    fontSize = 64,
  } = config;

  // Detect gradient vs color vs image URL
  const isGradient = background.includes('gradient');
  const isUrl = background.startsWith('http') || background.startsWith('/');
  const bgStyle: React.CSSProperties = isGradient
    ? { background }
    : isUrl
      ? {
          backgroundImage: `url(${background})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : { backgroundColor: background };

  return (
    <AbsoluteFill
      style={{
        ...bgStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems:
          textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        padding: '10%',
        opacity: entryProgress,
        transform: `scale(${0.9 + entryProgress * 0.1})`,
      }}
    >
      <div
        style={{
          color: textColor,
          fontSize,
          fontWeight: 'bold',
          fontFamily: 'Outfit, sans-serif',
          textAlign,
          lineHeight: 1.2,
          transform: `translateY(${(1 - entryProgress) * 30}px)`,
        }}
      >
        {headline}
      </div>
      {subtitle && (
        <div
          style={{
            color: textColor,
            fontSize: fontSize * 0.5,
            fontFamily: 'Inter, sans-serif',
            textAlign,
            marginTop: 20,
            opacity: entryProgress * 0.8,
            transform: `translateY(${(1 - entryProgress) * 20}px)`,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
