/**
 * Registers the VideoClip composition with the Remotion registry.
 *
 * Self-registers on import. Import this file to make VideoClip available
 * for rendering (e.g. for the captions module).
 */
import type { CalculateMetadataFunction } from 'remotion';
import { registerComposition } from './registry';
import { VideoClipComposition } from './VideoClipComposition';
import { videoClipPropsSchema } from '../schemas/video-clip-props';
import type { VideoClipProps } from '../schemas/video-clip-props';

const FPS = 30;

const calculateVideoClipMetadata: CalculateMetadataFunction<VideoClipProps> = async ({ props }) => {
  const durationSeconds = props.durationSeconds ?? 30;
  return {
    durationInFrames: Math.ceil(durationSeconds * FPS),
  };
};

registerComposition({
  id: 'VideoClip',
  component: VideoClipComposition,
  schema: videoClipPropsSchema,
  calculateMetadata: calculateVideoClipMetadata,
  width: 1080,
  height: 1920,
  defaultDurationInFrames: FPS * 30,
  fps: FPS,
  defaultProps: {
    clips: [
      {
        url: 'https://example.com/clip1.mp4',
        startTime: 0,
        endTime: 10,
        transition: 'crossfade' as const,
        transitionDurationMs: 300,
      },
    ],
    cues: [
      { id: '1', text: 'First caption cue', startTime: 0, endTime: 3 },
      { id: '2', text: 'Second caption cue', startTime: 3, endTime: 6 },
    ],
    durationSeconds: 30,
    musicVolume: 0.15,
    backgroundColor: '#000000',
  },
});

export {
  videoClipPropsSchema,
  type VideoClipProps,
  type VideoClip,
} from '../schemas/video-clip-props';
export { VideoClipComposition } from './VideoClipComposition';
