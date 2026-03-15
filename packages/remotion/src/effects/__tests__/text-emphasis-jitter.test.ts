import { describe, it, expect } from 'vitest';
import { textEmphasisSchema } from '../schemas';

describe('TextEmphasis jitter config', () => {
  it('accepts jitter parameter', () => {
    const result = textEmphasisSchema.safeParse({
      type: 'text-emphasis',
      startTime: 0,
      endTime: 2,
      text: 'HELLO',
      jitter: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jitter).toBe(3);
    }
  });

  it('defaults jitter to 0 (no jitter)', () => {
    const result = textEmphasisSchema.safeParse({
      type: 'text-emphasis',
      startTime: 0,
      endTime: 2,
      text: 'HELLO',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jitter).toBe(0);
    }
  });

  it('rejects jitter out of range', () => {
    const result = textEmphasisSchema.safeParse({
      type: 'text-emphasis',
      startTime: 0,
      endTime: 2,
      text: 'HELLO',
      jitter: 20,
    });
    expect(result.success).toBe(false);
  });
});
