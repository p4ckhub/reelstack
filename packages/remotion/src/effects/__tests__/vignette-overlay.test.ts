import { describe, it, expect } from 'vitest';
import { vignetteOverlaySchema, effectSegmentSchema } from '../schemas';

describe('VignetteOverlay schema', () => {
  it('accepts minimal config', () => {
    const result = vignetteOverlaySchema.safeParse({
      type: 'vignette-overlay',
      startTime: 0,
      endTime: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intensity).toBe(0.3);
      expect(result.data.color).toBe('#000000');
    }
  });

  it('accepts custom intensity and color', () => {
    const result = vignetteOverlaySchema.safeParse({
      type: 'vignette-overlay',
      startTime: 0,
      endTime: 60,
      intensity: 0.6,
      color: '#1a0000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects intensity out of range', () => {
    expect(
      vignetteOverlaySchema.safeParse({
        type: 'vignette-overlay',
        startTime: 0,
        endTime: 30,
        intensity: 1.5,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'vignette-overlay',
      startTime: 0,
      endTime: 30,
    });
    expect(result.success).toBe(true);
  });
});
