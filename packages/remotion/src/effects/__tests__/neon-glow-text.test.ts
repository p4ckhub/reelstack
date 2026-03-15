import { describe, it, expect } from 'vitest';
import { neonGlowTextSchema, effectSegmentSchema } from '../schemas';

describe('NeonGlowText schema', () => {
  it('accepts minimal config', () => {
    const result = neonGlowTextSchema.safeParse({
      type: 'neon-glow-text',
      startTime: 0,
      endTime: 5,
      text: 'HELLO',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBe('#00f2ff');
      expect(result.data.fontSize).toBe(72);
      expect(result.data.position).toBe('center');
    }
  });

  it('accepts full config', () => {
    const result = neonGlowTextSchema.safeParse({
      type: 'neon-glow-text',
      startTime: 2,
      endTime: 8,
      text: 'NEON',
      color: '#ff00ff',
      fontSize: 120,
      position: 'top',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing text', () => {
    expect(
      neonGlowTextSchema.safeParse({
        type: 'neon-glow-text',
        startTime: 0,
        endTime: 5,
      }).success
    ).toBe(false);
  });

  it('rejects empty text', () => {
    expect(
      neonGlowTextSchema.safeParse({
        type: 'neon-glow-text',
        startTime: 0,
        endTime: 5,
        text: '',
      }).success
    ).toBe(false);
  });

  it('rejects fontSize out of range', () => {
    expect(
      neonGlowTextSchema.safeParse({
        type: 'neon-glow-text',
        startTime: 0,
        endTime: 5,
        text: 'TEST',
        fontSize: 300,
      }).success
    ).toBe(false);
  });

  it('is included in discriminated union', () => {
    const result = effectSegmentSchema.safeParse({
      type: 'neon-glow-text',
      startTime: 0,
      endTime: 5,
      text: 'GLOW',
    });
    expect(result.success).toBe(true);
  });
});
