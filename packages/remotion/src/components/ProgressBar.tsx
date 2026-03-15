import { useCurrentFrame, useVideoConfig } from 'remotion';

interface ProgressBarProps {
  readonly color?: string;
  readonly height?: number;
  readonly trackColor?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  color = '#00d4ff',
  height = 6,
  trackColor = 'rgba(255,255,255,0.1)',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const progress = (frame / durationInFrames) * 100;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width,
        height,
        backgroundColor: trackColor,
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: color,
        }}
      />
    </div>
  );
};
