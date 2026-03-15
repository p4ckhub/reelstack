import { describe, it, expect } from 'vitest';
import { formatTime, parseTime, formatDisplay } from './time-utils';

describe('formatTime', () => {
  it('formats zero seconds as SRT', () => {
    expect(formatTime(0)).toBe('00:00:00,000');
  });

  it('formats seconds with milliseconds', () => {
    expect(formatTime(1.5)).toBe('00:00:01,500');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(65.123)).toBe('00:01:05,123');
  });

  it('formats hours', () => {
    expect(formatTime(3661.5)).toBe('01:01:01,500');
  });

  it('formats as ASS timestamp', () => {
    expect(formatTime(65.123, 'ass')).toBe('0:01:05.12');
  });

  it('handles negative values as zero', () => {
    expect(formatTime(-5)).toBe('00:00:00,000');
  });
});

describe('parseTime', () => {
  it('parses SRT timestamp with comma', () => {
    expect(parseTime('00:01:05,123')).toBeCloseTo(65.123, 2);
  });

  it('parses timestamp with period', () => {
    expect(parseTime('00:01:05.123')).toBeCloseTo(65.123, 2);
  });

  it('parses zero timestamp', () => {
    expect(parseTime('00:00:00,000')).toBe(0);
  });

  it('parses hour timestamps', () => {
    expect(parseTime('01:00:00,000')).toBe(3600);
  });

  it('throws on invalid format', () => {
    expect(() => parseTime('invalid')).toThrow('Invalid timestamp');
  });
});

describe('formatDisplay', () => {
  it('formats short time', () => {
    expect(formatDisplay(65)).toBe('1:05');
  });

  it('formats with hours', () => {
    expect(formatDisplay(3661)).toBe('1:01:01');
  });

  it('formats zero', () => {
    expect(formatDisplay(0)).toBe('0:00');
  });
});
