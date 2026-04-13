import type { CalculateMetadataFunction } from 'remotion';
import type { YouTubeProps } from '../schemas/youtube-props';

const FPS = 30;
const MIN_DURATION_SECONDS = 1;
const DEFAULT_DURATION_SECONDS = 60;

async function getMediaDuration(url: string): Promise<number | null> {
  try {
    const { getVideoMetadata } = await import('@remotion/renderer');
    const meta = await getVideoMetadata(url);
    return meta.durationInSeconds;
  } catch {
    return null;
  }
}

/**
 * Calculates YouTube video duration from all time-based sources.
 * Takes maximum of: video duration, cues, B-roll, chapters, counters, highlights, zoom, CTAs.
 */
export const calculateYouTubeMetadata: CalculateMetadataFunction<YouTubeProps> = async ({
  props,
}) => {
  const durations: number[] = [];

  if (props.primaryVideoUrl) {
    const d = await getMediaDuration(props.primaryVideoUrl);
    if (d !== null) durations.push(d);
  }

  if (props.voiceoverUrl) {
    const d = await getMediaDuration(props.voiceoverUrl);
    if (d !== null) durations.push(d);
  }

  // All time-based segment arrays
  const segmentArrays = [
    props.cues,
    props.bRollSegments,
    props.chapters,
    props.counters,
    props.highlights,
    props.zoomSegments,
    props.ctaSegments,
    props.lowerThirds,
    props.pipSegments,
  ];

  for (const segments of segmentArrays) {
    if (segments && segments.length > 0) {
      const lastEnd = Math.max(...segments.map((s) => s.endTime));
      durations.push(lastEnd);
    }
  }

  const maxDuration =
    durations.length > 0 ? Math.max(MIN_DURATION_SECONDS, ...durations) : DEFAULT_DURATION_SECONDS;

  return {
    fps: FPS,
    durationInFrames: Math.ceil(maxDuration * FPS),
  };
};
