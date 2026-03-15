import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../detect-language';

describe('detectLanguage', () => {
  it('returns explicit language when provided', () => {
    expect(detectLanguage('pl', 'en-US')).toBe('pl');
  });

  it('extracts language from TTS locale', () => {
    expect(detectLanguage(undefined, 'en-US')).toBe('en');
    expect(detectLanguage(undefined, 'pl-PL')).toBe('pl');
  });

  it('handles TTS locale without dash', () => {
    expect(detectLanguage(undefined, 'en')).toBe('en');
  });

  it('returns fallback when nothing provided', () => {
    expect(detectLanguage()).toBe('en');
    expect(detectLanguage(undefined, undefined)).toBe('en');
  });

  it('returns custom fallback', () => {
    expect(detectLanguage(undefined, undefined, 'pl')).toBe('pl');
  });

  it('ignores empty string explicit', () => {
    expect(detectLanguage('', 'pl-PL')).toBe('pl');
  });

  it('ignores empty string TTS locale', () => {
    expect(detectLanguage(undefined, '')).toBe('en');
  });

  it('handles empty string split edge case (empty before dash)', () => {
    // '-US'.split('-')[0] === '' which is falsy
    expect(detectLanguage(undefined, '-US')).toBe('en');
  });
});
