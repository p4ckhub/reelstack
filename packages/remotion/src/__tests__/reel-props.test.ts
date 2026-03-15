import { describe, it, expect } from 'vitest';
import { reelPropsSchema } from '../schemas/reel-props';

describe('reelPropsSchema', () => {
  it('validates minimal split-screen props', () => {
    const result = reelPropsSchema.safeParse({
      layout: 'split-screen',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layout).toBe('split-screen');
      expect(result.data.showProgressBar).toBe(true);
      expect(result.data.backgroundColor).toBe('#000000');
      expect(result.data.cues).toEqual([]);
      expect(result.data.bRollSegments).toEqual([]);
    }
  });

  it('validates fullscreen props with cues', () => {
    const result = reelPropsSchema.safeParse({
      layout: 'fullscreen',
      primaryVideoUrl: 'https://example.com/video.mp4',
      cues: [
        { id: '1', text: 'Hello', startTime: 0, endTime: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates b-roll segments', () => {
    const result = reelPropsSchema.safeParse({
      layout: 'split-screen',
      bRollSegments: [
        {
          startTime: 3,
          endTime: 5,
          media: { url: 'https://example.com/broll.mp4', type: 'video' },
          animation: 'spring-scale',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates b-roll segments with transitions', () => {
    const result = reelPropsSchema.safeParse({
      layout: 'split-screen',
      bRollSegments: [
        {
          startTime: 3,
          endTime: 5,
          media: { url: 'https://example.com/broll.mp4', type: 'video' },
          transition: { type: 'crossfade', durationMs: 500 },
        },
        {
          startTime: 8,
          endTime: 12,
          media: { url: 'https://example.com/broll2.mp4', type: 'video' },
          transition: { type: 'slide-left' },
        },
        {
          startTime: 15,
          endTime: 18,
          media: { url: '#ff0000', type: 'color' },
          transition: { type: 'none' },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bRollSegments[0].transition?.type).toBe('crossfade');
      expect(result.data.bRollSegments[0].transition?.durationMs).toBe(500);
      expect(result.data.bRollSegments[1].transition?.type).toBe('slide-left');
      expect(result.data.bRollSegments[2].transition?.type).toBe('none');
    }
  });

  it('rejects invalid transition type', () => {
    const result = reelPropsSchema.safeParse({
      layout: 'split-screen',
      bRollSegments: [
        {
          startTime: 3,
          endTime: 5,
          media: { url: 'https://example.com/broll.mp4', type: 'video' },
          transition: { type: 'dissolve' },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid layout', () => {
    const result = reelPropsSchema.safeParse({
      layout: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('validates music volume range', () => {
    const overMax = reelPropsSchema.safeParse({
      layout: 'fullscreen',
      musicVolume: 1.5,
    });
    expect(overMax.success).toBe(false);

    const valid = reelPropsSchema.safeParse({
      layout: 'fullscreen',
      musicVolume: 0.7,
    });
    expect(valid.success).toBe(true);
  });
});
