import { describe, it, expect } from 'vitest';
import { crtOverlaySchema, effectSegmentSchema } from '../schemas';

describe('CRTOverlay schema', () => {
  it('accepts minimal config', () => {
    const result = crtOverlaySchema.safeParse({
      type: 'crt-overlay',
      startTime: 0,
      endTime: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opacity).toBe(0.08);
      expect(result.data.scanlineSpacing).toBe(4);
      expect(result.data.grainIntensity).toBe(0.3);
    }
  });

  it('accepts full config', () => {
    const result = crtOverlaySchema.safeParse({
      type: 'crt-overlay',
      startTime: 0,
      endTime: 60,
      opacity: 0.12,
      scanlineSpacing: 3,
      grainIntensity: 0.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opacity).toBe(0.12);
      expect(result.data.scanlineSpacing).toBe(3);
      expect(result.data.grainIntensity).toBe(0.5);
    }
  });

  it('rejects opacity out of range', () => {
    const result = crtOverlaySchema.safeParse({
      type: 'crt-overlay',
      startTime: 0,
      endTime: 30,
      opacity: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects scanlineSpacing out of range', () => {
    const result = crtOverlaySchema.safeParse({
      type: 'crt-overlay',
      startTime: 0,
      endTime: 30,
      scanlineSpacing: 0,
    });
    expect(result.success).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'crt-overlay',
      startTime: 0,
      endTime: 30,
    });
    expect(result.success).toBe(true);
  });
});
