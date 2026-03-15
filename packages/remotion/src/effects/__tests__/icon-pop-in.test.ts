import { describe, it, expect } from 'vitest';
import { iconPopInSchema, effectSegmentSchema } from '../schemas';

describe('IconPopIn schema', () => {
  it('accepts minimal config', () => {
    const result = iconPopInSchema.safeParse({
      type: 'icon-pop-in',
      startTime: 0,
      endTime: 2,
      imageUrl: 'https://example.com/logo.png',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.size).toBe(120);
      expect(result.data.position).toBe('center');
    }
  });

  it('accepts full config with glow', () => {
    const result = iconPopInSchema.safeParse({
      type: 'icon-pop-in',
      startTime: 1,
      endTime: 3,
      imageUrl: 'https://example.com/icon.svg',
      size: 200,
      position: 'top-right',
      glowColor: '#00f2ff',
    });
    expect(result.success).toBe(true);
  });

  it('requires imageUrl', () => {
    expect(
      iconPopInSchema.safeParse({
        type: 'icon-pop-in',
        startTime: 0,
        endTime: 2,
      }).success
    ).toBe(false);
  });

  it('rejects size out of range', () => {
    expect(
      iconPopInSchema.safeParse({
        type: 'icon-pop-in',
        startTime: 0,
        endTime: 2,
        imageUrl: 'https://example.com/logo.png',
        size: 10,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'icon-pop-in',
      startTime: 0,
      endTime: 2,
      imageUrl: 'https://example.com/logo.png',
    });
    expect(result.success).toBe(true);
  });
});
