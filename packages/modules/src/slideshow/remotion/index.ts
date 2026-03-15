/**
 * Slideshow Remotion module.
 * Self-registers the Slideshow composition on import.
 */

import type { CalculateMetadataFunction } from 'remotion';
import { registerComposition } from '@reelstack/remotion/compositions/registry';
import { SlideshowComposition } from './composition';
import { slideshowPropsSchema, type SlideshowProps } from './schema';

const FPS = 30;
const MIN_DURATION_SECONDS = 3;
const DEFAULT_DURATION_SECONDS = 15;

/**
 * Dynamically set composition duration from props.durationSeconds.
 * Falls back to cue end times or DEFAULT_DURATION_SECONDS.
 */
const calculateSlideshowMetadata: CalculateMetadataFunction<SlideshowProps> = async ({
  props,
}) => {
  const durations: number[] = [];

  if (props.durationSeconds) {
    durations.push(props.durationSeconds);
  }

  if (props.cues && props.cues.length > 0) {
    const lastCueEnd = Math.max(...props.cues.map((c) => c.endTime));
    durations.push(lastCueEnd);
  }

  if (props.slides && props.slides.length > 0) {
    const lastSlideEnd = Math.max(...props.slides.map((s) => s.endTime));
    durations.push(lastSlideEnd);
  }

  const maxDuration =
    durations.length > 0
      ? Math.max(MIN_DURATION_SECONDS, ...durations)
      : DEFAULT_DURATION_SECONDS;

  return {
    fps: FPS,
    durationInFrames: Math.ceil(maxDuration * FPS),
  };
};

registerComposition({
  id: 'Slideshow',
  component: SlideshowComposition,
  schema: slideshowPropsSchema,
  calculateMetadata: calculateSlideshowMetadata,
  width: 1080,
  height: 1920,
  defaultDurationInFrames: FPS * 30,
  fps: FPS,
  defaultProps: {
    slides: [
      {
        imageUrl: 'https://via.placeholder.com/1080x1920/1a1a2e/FFFFFF?text=Slide+1',
        startTime: 0,
        endTime: 6,
        transition: 'none' as const,
        transitionDurationMs: 0,
      },
      {
        imageUrl: 'https://via.placeholder.com/1080x1920/16213e/FFFFFF?text=Slide+2',
        startTime: 6,
        endTime: 12,
        transition: 'crossfade' as const,
        transitionDurationMs: 400,
      },
    ],
    cues: [
      { id: '1', text: 'Welcome to the slideshow', startTime: 0, endTime: 3 },
      { id: '2', text: 'This is slide two', startTime: 6, endTime: 9 },
    ],
    durationSeconds: 12,
    musicVolume: 0.2,
    backgroundColor: '#000000',
  },
});

export { slideshowPropsSchema, type SlideshowProps } from './schema';
export { SlideshowComposition } from './composition';
