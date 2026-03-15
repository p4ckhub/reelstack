import { describe, it, expect } from 'vitest';
import { circularPipSchema, effectSegmentSchema } from '../schemas';

describe('CircularPip schema', () => {
  it('accepts minimal config', () => {
    const result = circularPipSchema.safeParse({
      type: 'circular-pip',
      startTime: 0,
      endTime: 30,
      videoUrl: 'https://example.com/face.mp4',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.size).toBe(25);
      expect(result.data.position).toBe('bottom-right');
      expect(result.data.glowColor).toBe('#00f2ff');
      expect(result.data.glowIntensity).toBe(0.6);
    }
  });

  it('accepts full config', () => {
    const result = circularPipSchema.safeParse({
      type: 'circular-pip',
      startTime: 0,
      endTime: 60,
      videoUrl: 'https://example.com/face.mp4',
      size: 30,
      position: 'top-left',
      glowColor: '#ff00ff',
      glowIntensity: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing videoUrl', () => {
    expect(
      circularPipSchema.safeParse({
        type: 'circular-pip',
        startTime: 0,
        endTime: 30,
      }).success
    ).toBe(false);
  });

  it('rejects size out of range', () => {
    expect(
      circularPipSchema.safeParse({
        type: 'circular-pip',
        startTime: 0,
        endTime: 30,
        videoUrl: 'https://example.com/face.mp4',
        size: 80,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'circular-pip',
      startTime: 0,
      endTime: 30,
      videoUrl: 'https://example.com/face.mp4',
    });
    expect(result.success).toBe(true);
  });
});
