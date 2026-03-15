import { describe, it, expect } from 'vitest';
import { parseSRT, formatSRT } from './srt-parser';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,500 --> 00:00:08,000
This is a subtitle
with two lines.

3
00:00:10,000 --> 00:00:12,500
Goodbye!`;

describe('parseSRT', () => {
  it('parses valid SRT content', () => {
    const cues = parseSRT(SAMPLE_SRT);
    expect(cues).toHaveLength(3);
    expect(cues[0].text).toBe('Hello, world!');
    expect(cues[0].startTime).toBeCloseTo(1.0, 2);
    expect(cues[0].endTime).toBeCloseTo(4.0, 2);
  });

  it('handles multiline subtitles', () => {
    const cues = parseSRT(SAMPLE_SRT);
    expect(cues[1].text).toBe('This is a subtitle\nwith two lines.');
  });

  it('returns empty array for empty input', () => {
    expect(parseSRT('')).toEqual([]);
  });

  it('handles Windows line endings', () => {
    const windowsSRT = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n';
    const cues = parseSRT(windowsSRT);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello');
  });

  it('skips malformed blocks', () => {
    const bad = `invalid block

1
00:00:01,000 --> 00:00:02,000
Valid`;
    const cues = parseSRT(bad);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Valid');
  });

  it('assigns unique IDs to each cue', () => {
    const cues = parseSRT(SAMPLE_SRT);
    const ids = cues.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('formatSRT', () => {
  it('formats cues to SRT string', () => {
    const cues = [
      { id: '1', startTime: 1, endTime: 4, text: 'Hello' },
      { id: '2', startTime: 5, endTime: 8, text: 'World' },
    ];
    const result = formatSRT(cues);
    expect(result).toContain('1\n00:00:01,000 --> 00:00:04,000\nHello');
    expect(result).toContain('2\n00:00:05,000 --> 00:00:08,000\nWorld');
  });

  it('sorts cues by start time', () => {
    const cues = [
      { id: '1', startTime: 5, endTime: 8, text: 'Second' },
      { id: '2', startTime: 1, endTime: 4, text: 'First' },
    ];
    const result = formatSRT(cues);
    expect(result.indexOf('First')).toBeLessThan(result.indexOf('Second'));
  });

  it('roundtrips correctly', () => {
    const original = parseSRT(SAMPLE_SRT);
    const formatted = formatSRT(original);
    const reparsed = parseSRT(formatted);

    expect(reparsed).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i].text).toBe(original[i].text);
      expect(reparsed[i].startTime).toBeCloseTo(original[i].startTime, 2);
      expect(reparsed[i].endTime).toBeCloseTo(original[i].endTime, 2);
    }
  });
});
