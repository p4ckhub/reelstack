import { describe, it, expect } from 'vitest';
import { generateASS } from './ass-generator';
import { DEFAULT_SUBTITLE_STYLE } from '@reelstack/types';
import type { SubtitleCue } from '@reelstack/types';

const SAMPLE_CUES: SubtitleCue[] = [
  { id: '1', startTime: 1, endTime: 4, text: 'Hello, world!' },
  { id: '2', startTime: 5.5, endTime: 8, text: 'Line one\nLine two' },
];

describe('generateASS', () => {
  it('generates valid ASS file structure', () => {
    const result = generateASS(SAMPLE_CUES, DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain('[Script Info]');
    expect(result).toContain('[V4+ Styles]');
    expect(result).toContain('[Events]');
  });

  it('includes correct dialogue lines', () => {
    const result = generateASS(SAMPLE_CUES, DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain('Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello, world!');
  });

  it('converts newlines to ASS line breaks', () => {
    const result = generateASS(SAMPLE_CUES, DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain('Line one\\NLine two');
  });

  it('applies font family from style', () => {
    const style = { ...DEFAULT_SUBTITLE_STYLE, fontFamily: 'Impact' };
    const result = generateASS(SAMPLE_CUES, style);
    expect(result).toContain('Impact');
  });

  it('applies font size from style', () => {
    const style = { ...DEFAULT_SUBTITLE_STYLE, fontSize: 48 };
    const result = generateASS(SAMPLE_CUES, style);
    expect(result).toContain(',48,');
  });

  it('uses custom resolution', () => {
    const result = generateASS(SAMPLE_CUES, DEFAULT_SUBTITLE_STYLE, 1280, 720);
    expect(result).toContain('PlayResX: 1280');
    expect(result).toContain('PlayResY: 720');
  });

  it('sorts cues by start time', () => {
    const reversed: SubtitleCue[] = [
      { id: '2', startTime: 5, endTime: 8, text: 'CUE_SECOND' },
      { id: '1', startTime: 1, endTime: 4, text: 'CUE_FIRST' },
    ];
    const result = generateASS(reversed, DEFAULT_SUBTITLE_STYLE);
    const firstIdx = result.indexOf('CUE_FIRST');
    const secondIdx = result.indexOf('CUE_SECOND');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('handles empty cues array', () => {
    const result = generateASS([], DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain('[Events]');
    // Should have header but no Dialogue lines
    expect(result).not.toContain('Dialogue:');
  });

  it('generates karaoke \\kf tags for cues with words and karaoke animation', () => {
    const karaokeCues: SubtitleCue[] = [
      {
        id: 'k1',
        startTime: 0,
        endTime: 3,
        text: 'Hello beautiful world',
        words: [
          { text: 'Hello', startTime: 0, endTime: 1 },
          { text: 'beautiful', startTime: 1, endTime: 2 },
          { text: 'world', startTime: 2, endTime: 3 },
        ],
      },
    ];
    const karaokeStyle = { ...DEFAULT_SUBTITLE_STYLE, animationStyle: 'karaoke' as const };
    const result = generateASS(karaokeCues, karaokeStyle);
    expect(result).toContain('{\\kf100}Hello');
    expect(result).toContain('{\\kf100}beautiful');
    expect(result).toContain('{\\kf100}world');
  });

  it('uses plain text for cues with words but non-karaoke animation', () => {
    const cues: SubtitleCue[] = [
      {
        id: 'k2',
        startTime: 0,
        endTime: 2,
        text: 'Hello world',
        words: [
          { text: 'Hello', startTime: 0, endTime: 1 },
          { text: 'world', startTime: 1, endTime: 2 },
        ],
      },
    ];
    const highlightStyle = { ...DEFAULT_SUBTITLE_STYLE, animationStyle: 'word-highlight' as const };
    const result = generateASS(cues, highlightStyle);
    expect(result).not.toContain('\\kf');
    expect(result).toContain('Hello world');
  });
});
