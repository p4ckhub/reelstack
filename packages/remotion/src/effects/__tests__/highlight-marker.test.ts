import { describe, it, expect } from 'vitest';
import { highlightMarkerSchema, effectSegmentSchema } from '../schemas';

describe('HighlightMarker schema', () => {
  it('accepts minimal config', () => {
    const result = highlightMarkerSchema.safeParse({
      type: 'highlight-marker',
      startTime: 0,
      endTime: 3,
      x: 10,
      y: 20,
      width: 50,
      height: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBe('#FFFF00');
      expect(result.data.opacity).toBe(0.35);
    }
  });

  it('accepts full config', () => {
    const result = highlightMarkerSchema.safeParse({
      type: 'highlight-marker',
      startTime: 2,
      endTime: 5,
      x: 5,
      y: 40,
      width: 80,
      height: 8,
      color: '#FF6600',
      opacity: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('requires x, y, width, height', () => {
    expect(
      highlightMarkerSchema.safeParse({
        type: 'highlight-marker',
        startTime: 0,
        endTime: 3,
        x: 10,
        y: 20,
      }).success
    ).toBe(false);
  });

  it('rejects coordinates out of range', () => {
    expect(
      highlightMarkerSchema.safeParse({
        type: 'highlight-marker',
        startTime: 0,
        endTime: 3,
        x: 110,
        y: 20,
        width: 50,
        height: 5,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'highlight-marker',
      startTime: 0,
      endTime: 3,
      x: 10,
      y: 20,
      width: 50,
      height: 5,
    });
    expect(result.success).toBe(true);
  });
});
