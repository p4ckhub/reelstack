import { describe, test, expect } from 'vitest';
import {
  renderAnimatedCaption,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
} from '../engines/caption-animation-renderer';
import type { SubtitleCue } from '@reelstack/types';

function makeCue(overrides?: Partial<SubtitleCue>): SubtitleCue {
  return {
    id: 'cue-1',
    startTime: 1.0,
    endTime: 3.0,
    text: 'Hello world test',
    words: [
      { text: 'Hello', startTime: 1.0, endTime: 1.4 },
      { text: 'world', startTime: 1.4, endTime: 1.8 },
      { text: 'test', startTime: 1.8, endTime: 2.2 },
    ],
    ...overrides,
  };
}

const snapPopStyle = { animationStyle: 'snap-pop' };

describe('caption-animation-renderer', () => {
  describe('snap-pop', () => {
    const cue = makeCue();

    test('words before their startTime are hidden', () => {
      const frame = renderAnimatedCaption(cue, 1.0, snapPopStyle);
      const worldSeg = frame.segments.find((s) => s.text === 'world');
      expect(worldSeg?.opacity).toBe(0);
      expect(worldSeg?.style).toBe('hidden');
    });

    test('word at startTime has pop scale > 1.0', () => {
      const frame = renderAnimatedCaption(cue, 1.001, snapPopStyle);
      const helloSeg = frame.segments.find((s) => s.text === 'Hello');
      expect(helloSeg?.opacity).toBe(1);
      expect(helloSeg?.scale).toBeGreaterThan(1.0);
      expect(helloSeg?.scale).toBeLessThanOrEqual(1.3);
    });

    test('word settles to scale 1.0 after pop duration', () => {
      const frame = renderAnimatedCaption(cue, 1.15, snapPopStyle);
      const helloSeg = frame.segments.find((s) => s.text === 'Hello');
      expect(helloSeg?.scale).toBe(1);
      expect(helloSeg?.opacity).toBe(1);
    });

    test('all words visible after all have started', () => {
      const frame = renderAnimatedCaption(cue, 2.0, snapPopStyle);
      expect(frame.segments.length).toBe(3);
      for (const seg of frame.segments) {
        expect(seg.opacity).toBe(1);
        expect(seg.scale).toBe(1);
      }
    });

    test('returns empty outside cue time range', () => {
      const before = renderAnimatedCaption(cue, 0.5, snapPopStyle);
      expect(before.visible).toBe(false);
      const after = renderAnimatedCaption(cue, 3.5, snapPopStyle);
      expect(after.visible).toBe(false);
    });
  });

  describe('defaults', () => {
    test('no animationStyle renders static text', () => {
      const cue = makeCue();
      const frame = renderAnimatedCaption(cue, 1.5);
      expect(frame.visible).toBe(true);
      // 'none' renders full text as single segment
      expect(frame.segments.length).toBe(1);
      expect(frame.segments[0].text).toBe('Hello world test');
    });

    test('word-highlight scales active word', () => {
      const cue = makeCue();
      const frame = renderAnimatedCaption(cue, 1.2, { animationStyle: 'word-highlight' });
      const hello = frame.segments.find((s) => s.text === 'Hello');
      expect(hello?.scale).toBe(1.15);
      expect(hello?.style).toBe('highlighted');
    });
  });

  test('CAPTION_ANIMATION_STYLES includes snap-pop', () => {
    expect(CAPTION_ANIMATION_STYLES).toContain('snap-pop');
  });

  test('getAnimationStyleDisplayName returns Snap Pop', () => {
    expect(getAnimationStyleDisplayName('snap-pop')).toBe('Snap Pop');
  });
});
