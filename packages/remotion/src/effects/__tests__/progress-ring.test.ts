import { describe, it, expect } from 'vitest';
import { progressRingSchema, effectSegmentSchema } from '../schemas';

describe('ProgressRing schema', () => {
  it('accepts minimal config', () => {
    const result = progressRingSchema.safeParse({
      type: 'progress-ring',
      startTime: 0,
      endTime: 3,
      targetPercent: 75,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.size).toBe(200);
      expect(result.data.strokeWidth).toBe(12);
      expect(result.data.trackColor).toBe('#333333');
      expect(result.data.fillColor).toBe('#3B82F6');
    }
  });

  it('accepts full config', () => {
    const result = progressRingSchema.safeParse({
      type: 'progress-ring',
      startTime: 2,
      endTime: 5,
      targetPercent: 90,
      size: 300,
      strokeWidth: 20,
      fillColor: '#FF0055',
      trackColor: '#111111',
      label: '90%',
      labelFontSize: 64,
      labelColor: '#FFFFFF',
      position: 'top-right',
    });
    expect(result.success).toBe(true);
  });

  it('rejects targetPercent out of range', () => {
    expect(
      progressRingSchema.safeParse({
        type: 'progress-ring',
        startTime: 0,
        endTime: 3,
        targetPercent: 150,
      }).success
    ).toBe(false);
  });

  it('requires targetPercent', () => {
    expect(
      progressRingSchema.safeParse({
        type: 'progress-ring',
        startTime: 0,
        endTime: 3,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'progress-ring',
      startTime: 0,
      endTime: 3,
      targetPercent: 50,
    });
    expect(result.success).toBe(true);
  });
});
