import { describe, it, expect } from 'vitest';
import { remapFrame } from '../utils/remap-frame';

describe('remapFrame', () => {
  const fps = 30;

  it('returns identity when no speed ramps', () => {
    expect(remapFrame(0, fps, [])).toBe(0);
    expect(remapFrame(60, fps, [])).toBe(60);
    expect(remapFrame(150, fps, [])).toBe(150);
  });

  it('applies 2x speed ramp', () => {
    // 2x speed from 1s-2s (frames 30-60)
    const ramps = [{ startTime: 1, endTime: 2, rate: 2 }];

    // Before ramp: 1:1
    expect(remapFrame(15, fps, ramps)).toBe(15);

    // At ramp start: frame 30 = 30 frames at 1x = video frame 30
    expect(remapFrame(30, fps, ramps)).toBe(30);

    // Midway through ramp: frame 45 = 30 at 1x + 15 at 2x = 30 + 30 = 60
    expect(remapFrame(45, fps, ramps)).toBe(60);

    // End of ramp: frame 60 = 30 at 1x + 30 at 2x = 30 + 60 = 90
    expect(remapFrame(60, fps, ramps)).toBe(90);

    // After ramp: frame 75 = 30@1x + 30@2x + 15@1x = 30 + 60 + 15 = 105
    expect(remapFrame(75, fps, ramps)).toBe(105);
  });

  it('applies slow motion (0.5x)', () => {
    const ramps = [{ startTime: 1, endTime: 2, rate: 0.5 }];

    // At frame 45 (1.5s): 30 at 1x + 15 at 0.5x = 30 + 7.5 = 38 (rounded)
    expect(remapFrame(45, fps, ramps)).toBe(38);
  });

  it('handles multiple ramps', () => {
    const ramps = [
      { startTime: 1, endTime: 2, rate: 2 },
      { startTime: 3, endTime: 4, rate: 0.5 },
    ];

    // Before any ramp
    expect(remapFrame(15, fps, ramps)).toBe(15);

    // After first ramp, before second: frame 75 = 30@1x + 30@2x + 15@1x = 105
    expect(remapFrame(75, fps, ramps)).toBe(105);
  });
});
