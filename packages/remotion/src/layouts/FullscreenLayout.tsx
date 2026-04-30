import { AbsoluteFill, Loop, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { remapFrame } from '../utils/remap-frame';

interface FullscreenLayoutProps {
  readonly primaryVideoUrl?: string;
  readonly primaryVideoDurationSeconds?: number;
  readonly speedRamps?: readonly { startTime: number; endTime: number; rate: number }[];
}

/**
 * Fullscreen layout: single video source fills the entire frame.
 * Used for "subtitle burn" mode - video + captions overlay.
 * When `primaryVideoDurationSeconds` is set, the clip is wrapped in
 * Remotion's `<Loop>` so it repeats for the full reel duration. Without
 * the wrapper `OffthreadVideo` plays once and freezes on the last frame
 * — this regression has come back more than once because the comment
 * documented the intent but the code lost the wrapper.
 */
export const FullscreenLayout: React.FC<FullscreenLayoutProps> = ({
  primaryVideoUrl,
  primaryVideoDurationSeconds,
  speedRamps,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hasSpeedRamps = speedRamps && speedRamps.length > 0;
  const videoFrame = hasSpeedRamps ? remapFrame(frame, fps, speedRamps) : undefined;

  if (!primaryVideoUrl) {
    return <AbsoluteFill style={{ backgroundColor: '#0a0a14' }} />;
  }

  if (primaryVideoDurationSeconds && primaryVideoDurationSeconds > 0 && !hasSpeedRamps) {
    return (
      <Loop durationInFrames={Math.max(1, Math.round(primaryVideoDurationSeconds * fps))}>
        <OffthreadVideo
          muted
          src={resolveMediaUrl(primaryVideoUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </Loop>
    );
  }

  return (
    <OffthreadVideo
      muted
      src={resolveMediaUrl(primaryVideoUrl)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      startFrom={videoFrame}
    />
  );
};
