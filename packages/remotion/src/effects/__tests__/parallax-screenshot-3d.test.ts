import { describe, it, expect } from 'vitest';
import { parallaxScreenshot3DSchema, effectSegmentSchema } from '../schemas';

describe('ParallaxScreenshot3D schema', () => {
  it('accepts minimal config', () => {
    const result = parallaxScreenshot3DSchema.safeParse({
      type: 'parallax-screenshot-3d',
      startTime: 0,
      endTime: 3,
      imageUrl: 'https://example.com/screenshot.png',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tiltDegrees).toBe(-10);
      expect(result.data.borderRadius).toBe(24);
      expect(result.data.shadowDepth).toBe('deep');
      expect(result.data.position).toBe('center');
    }
  });

  it('accepts full config', () => {
    const result = parallaxScreenshot3DSchema.safeParse({
      type: 'parallax-screenshot-3d',
      startTime: 1,
      endTime: 4,
      imageUrl: 'https://example.com/ui.png',
      tiltDegrees: -15,
      borderRadius: 16,
      shadowDepth: 'shallow',
      position: 'left',
    });
    expect(result.success).toBe(true);
  });

  it('requires imageUrl', () => {
    expect(
      parallaxScreenshot3DSchema.safeParse({
        type: 'parallax-screenshot-3d',
        startTime: 0,
        endTime: 3,
      }).success
    ).toBe(false);
  });

  it('rejects tiltDegrees out of range', () => {
    expect(
      parallaxScreenshot3DSchema.safeParse({
        type: 'parallax-screenshot-3d',
        startTime: 0,
        endTime: 3,
        imageUrl: 'https://example.com/x.png',
        tiltDegrees: 90,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'parallax-screenshot-3d',
      startTime: 0,
      endTime: 3,
      imageUrl: 'https://example.com/x.png',
    });
    expect(result.success).toBe(true);
  });
});
