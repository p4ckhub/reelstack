import { describe, it, expect } from 'vitest';
import { chromaticAberrationSchema, effectSegmentSchema } from '../schemas';

describe('ChromaticAberration schema', () => {
  it('accepts minimal config', () => {
    const result = chromaticAberrationSchema.safeParse({
      type: 'chromatic-aberration',
      startTime: 0,
      endTime: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intensity).toBe(0.05);
    }
  });

  it('accepts custom intensity', () => {
    const result = chromaticAberrationSchema.safeParse({
      type: 'chromatic-aberration',
      startTime: 0,
      endTime: 60,
      intensity: 0.1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects intensity out of range', () => {
    expect(
      chromaticAberrationSchema.safeParse({
        type: 'chromatic-aberration',
        startTime: 0,
        endTime: 30,
        intensity: 0.5,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'chromatic-aberration',
      startTime: 0,
      endTime: 30,
    });
    expect(result.success).toBe(true);
  });
});
