import { describe, it, expect } from 'vitest';
import { buildCaptionsProps } from '../orchestrator';

const sampleCues = [
  { id: '1', text: 'Hello world', startTime: 0, endTime: 2 },
  { id: '2', text: 'This is a test', startTime: 2, endTime: 5 },
];

describe('buildCaptionsProps', () => {
  it('creates VideoClipProps with single clip from videoUrl', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: sampleCues,
      durationSeconds: 5,
    });

    expect(props.clips).toHaveLength(1);
    expect(props.clips[0]!.url).toBe('https://example.com/video.mp4');
    expect(props.clips[0]!.startTime).toBe(0);
    expect(props.clips[0]!.endTime).toBe(5);
    expect(props.clips[0]!.transition).toBe('none');
  });

  it('passes highlightMode through', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: sampleCues,
      durationSeconds: 5,
      highlightMode: 'pill',
    });

    expect(props.highlightMode).toBe('pill');
  });

  it('uses provided cues directly', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: sampleCues,
      durationSeconds: 5,
    });

    expect(props.cues).toHaveLength(2);
    expect(props.cues[0]!.text).toBe('Hello world');
    expect(props.cues[1]!.text).toBe('This is a test');
  });

  it('sets duration from cues endTime when no audioDuration', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: sampleCues,
    });

    // Max endTime from cues is 5
    expect(props.durationSeconds).toBe(5);
  });

  it('defaults captionStyle when not provided', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: sampleCues,
      durationSeconds: 5,
    });

    expect(props.captionStyle).toBeDefined();
    expect(props.captionStyle!.fontSize).toBe(64);
    expect(props.captionStyle!.fontColor).toBe('#FFFFFF');
    expect(props.captionStyle!.highlightColor).toBe('#FFD700');
  });
});
