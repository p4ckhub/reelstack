import { describe, it, expect, vi } from 'vitest';

// Mock @remotion/renderer before importing
vi.mock('@remotion/renderer', () => ({
  getVideoMetadata: vi.fn(),
}));

import { calculateReelMetadata } from '../compositions/calculate-metadata';
import { getVideoMetadata } from '@remotion/renderer';

const mockedGetVideoMetadata = getVideoMetadata as ReturnType<typeof vi.fn>;

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    props: {
      layout: 'split-screen' as const,
      bRollSegments: [],
      cues: [],
      pipSegments: [],
      lowerThirds: [],
      ctaSegments: [],
      counters: [],
      zoomSegments: [],
      highlights: [],
      effects: [],
      primaryVideoObjectPosition: 'center',
      primaryVideoTransparent: false,
      dynamicCaptionPosition: false,
      musicVolume: 0.3,
      showProgressBar: true,
      backgroundColor: '#000000',
      speedRamps: [],
      ...overrides,
    },
    defaultProps: {} as never,
    abortSignal: new AbortController().signal,
    compositionId: 'Reel',
    isRendering: false,
  };
}

describe('calculateReelMetadata', () => {
  it('returns default 15s when no sources provided', async () => {
    const result = await calculateReelMetadata(makeProps());
    expect(result).toEqual({ fps: 30, durationInFrames: 450 }); // 15 * 30
  });

  it('uses last cue endTime as duration', async () => {
    const result = await calculateReelMetadata(
      makeProps({
        cues: [
          { id: '1', text: 'Hello', startTime: 0, endTime: 3 },
          { id: '2', text: 'World', startTime: 3, endTime: 8 },
        ],
      })
    );
    expect(result).toEqual({ fps: 30, durationInFrames: 240 }); // 8 * 30
  });

  it('uses video duration when longer than cues', async () => {
    mockedGetVideoMetadata.mockResolvedValueOnce({
      durationInSeconds: 20,
      width: 1080,
      height: 1920,
      fps: 30,
      codec: 'h264',
      supportsSeeking: true,
      colorSpace: 'bt709',
      audioCodec: 'aac',
      audioFileExtension: 'aac',
      isRemote: false,
      canPlayInVideoTag: true,
      size: 1000000,
    } as never);

    const result = await calculateReelMetadata(
      makeProps({
        primaryVideoUrl: 'https://example.com/video.mp4',
        cues: [{ id: '1', text: 'Short', startTime: 0, endTime: 5 }],
      })
    );
    expect(result).toEqual({ fps: 30, durationInFrames: 600 }); // 20 * 30
  });

  it('uses B-roll endTime when longest', async () => {
    const result = await calculateReelMetadata(
      makeProps({
        cues: [{ id: '1', text: 'Short', startTime: 0, endTime: 5 }],
        bRollSegments: [
          {
            startTime: 10,
            endTime: 25,
            media: { url: '#ff0000', type: 'color' },
          },
        ],
      })
    );
    expect(result).toEqual({ fps: 30, durationInFrames: 750 }); // 25 * 30
  });

  it('handles video metadata errors gracefully', async () => {
    mockedGetVideoMetadata.mockRejectedValueOnce(new Error('Not found'));

    const result = await calculateReelMetadata(
      makeProps({
        primaryVideoUrl: 'https://invalid.com/video.mp4',
        cues: [{ id: '1', text: 'Fallback', startTime: 0, endTime: 10 }],
      })
    );
    expect(result).toEqual({ fps: 30, durationInFrames: 300 }); // 10 * 30 from cues
  });

  it('enforces minimum 1s duration', async () => {
    const result = await calculateReelMetadata(
      makeProps({
        cues: [{ id: '1', text: 'Quick', startTime: 0, endTime: 0.3 }],
      })
    );
    expect(result).toEqual({ fps: 30, durationInFrames: 30 }); // 1 * 30 (minimum)
  });
});
