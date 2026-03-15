import { describe, it, expect } from 'vitest';
import { adaptCaption, toPostizPlatform } from '../platform-adapters';

describe('adaptCaption', () => {
  it('returns caption unchanged when under limit', () => {
    const result = adaptCaption('Hello world', 'facebook');
    expect(result).toBe('Hello world');
  });

  it('appends hashtags with separator', () => {
    const result = adaptCaption('Hello', 'instagram', ['tech', 'reel']);
    expect(result).toBe('Hello\n\n#tech #reel');
  });

  it('adds # prefix to hashtags without one', () => {
    const result = adaptCaption('Hello', 'tiktok', ['tech', '#already']);
    expect(result).toContain('#tech');
    expect(result).toContain('#already');
  });

  it('limits hashtags to platform max', () => {
    const tags = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    const result = adaptCaption('Hello', 'x', tags); // X limit: 5
    const hashtagCount = (result.match(/#/g) ?? []).length;
    expect(hashtagCount).toBe(5);
  });

  it('trims caption for X (280 chars)', () => {
    const longCaption = 'a'.repeat(300);
    const result = adaptCaption(longCaption, 'x');
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result).toContain('...');
  });

  it('trims caption accounting for hashtag space', () => {
    const longCaption = 'a'.repeat(2200);
    const result = adaptCaption(longCaption, 'instagram', ['tag']);
    expect(result.length).toBeLessThanOrEqual(2200);
    expect(result).toContain('#tag');
  });

  it('handles empty hashtags array', () => {
    const result = adaptCaption('Hello', 'tiktok', []);
    expect(result).toBe('Hello');
  });
});

describe('toPostizPlatform', () => {
  it('maps tiktok to tiktok', () => {
    expect(toPostizPlatform('tiktok')).toBe('tiktok');
  });

  it('maps instagram to instagram', () => {
    expect(toPostizPlatform('instagram')).toBe('instagram');
  });

  it('maps youtube-shorts to youtube', () => {
    expect(toPostizPlatform('youtube-shorts')).toBe('youtube');
  });

  it('maps facebook to facebook', () => {
    expect(toPostizPlatform('facebook')).toBe('facebook');
  });

  it('maps linkedin to linkedin', () => {
    expect(toPostizPlatform('linkedin')).toBe('linkedin');
  });

  it('maps x to x', () => {
    expect(toPostizPlatform('x')).toBe('x');
  });
});
