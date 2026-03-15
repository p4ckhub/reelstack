import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { SegmentedProgressBar } from '../components/SegmentedProgressBar';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { computeEntrance } from '../utils/compute-entrance';
import type { VideoClipProps, VideoClip } from '../schemas/video-clip-props';

/**
 * VideoClipComposition: stitches multiple video clips with transitions + captions.
 * Used for captions mode (overlay captions on existing video) and any multi-clip compositions.
 *
 * Each clip plays in sequence. Adjacent clips can have crossfade/slide/zoom/wipe transitions.
 * Captions and optional voiceover/music are overlaid on top.
 *
 * Video clips may contain native audio (from AI video models like Kling 3.0/Veo 3/Seedance 2.0).
 * When voiceoverUrl is provided, clips are muted and the separate voiceover plays.
 * When voiceoverUrl is absent, clips play their own embedded audio.
 */
export const VideoClipComposition: React.FC<VideoClipProps> = (props) => {
  const { fps } = useVideoConfig();
  const {
    clips,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume = 0.15,
    backgroundColor = '#000000',
    captionStyle,
    highlightMode,
    showSegmentedProgress = true,
    segmentedProgressStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Video clips layer */}
      {clips.map((clip, i) => {
        const startFrame = Math.round(clip.startTime * fps);
        const durationFrames = Math.round((clip.endTime - clip.startTime) * fps);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={durationFrames}>
            <ClipSegment clip={clip} muted={!!voiceoverUrl} />
          </Sequence>
        );
      })}

      {/* Captions layer */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <CaptionOverlay
          cues={cues as Parameters<typeof CaptionOverlay>[0]['cues']}
          style={{
            fontSize: captionStyle?.fontSize ?? 64,
            fontColor: captionStyle?.fontColor ?? '#FFFFFF',
            highlightColor: captionStyle?.highlightColor ?? '#FFD700',
            position: captionStyle?.position ?? 80,
            highlightMode: highlightMode,
          }}
        />
      </AbsoluteFill>

      {/* Segmented progress bar (Instagram Stories-style, 2+ clips) */}
      {showSegmentedProgress && clips.length >= 2 && (
        <SegmentedProgressBar
          segments={clips.map((c) => ({ startTime: c.startTime, endTime: c.endTime }))}
          color={segmentedProgressStyle?.color}
          activeColor={segmentedProgressStyle?.activeColor}
          bgColor={segmentedProgressStyle?.bgColor}
          height={segmentedProgressStyle?.height}
        />
      )}

      {/* Voiceover audio */}
      {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} />}

      {/* Background music */}
      {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}
    </AbsoluteFill>
  );
};

/**
 * Renders a single video clip with entrance transition.
 * When muted=false, the clip's native audio track plays (for AI-generated speech).
 * When muted=true, a separate voiceover audio layer provides the speech.
 */
const ClipSegment: React.FC<{
  clip: VideoClip;
  muted: boolean;
}> = ({ clip, muted }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const transition = clip.transition ?? 'crossfade';
  const transitionDurationMs = clip.transitionDurationMs ?? 300;
  const transitionFrames = Math.round((transitionDurationMs / 1000) * fps);

  // Entrance animation
  const entrance = computeEntrance(frame, transitionFrames, transition);

  return (
    <AbsoluteFill style={{ opacity: entrance.opacity, transform: entrance.transform }}>
      <OffthreadVideo
        muted={muted}
        src={resolveMediaUrl(clip.url)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};
