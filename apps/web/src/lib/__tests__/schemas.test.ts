import { describe, it, expect } from 'vitest';
import {
  subtitleCueSchema,
  subtitleStyleSchema,
  saveSubtitlesSchema,
  createRenderSchema,
} from '../api/schemas';

describe('subtitleCueSchema', () => {
  it('accepts valid cue', () => {
    const result = subtitleCueSchema.safeParse({
      id: 'c1',
      startTime: 0,
      endTime: 2.5,
      text: 'Hello',
    });
    expect(result.success).toBe(true);
  });

  it('rejects cue with empty id', () => {
    const result = subtitleCueSchema.safeParse({
      id: '',
      startTime: 0,
      endTime: 2,
      text: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects cue with negative startTime', () => {
    const result = subtitleCueSchema.safeParse({
      id: 'c1',
      startTime: -1,
      endTime: 2,
      text: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects cue with too long text', () => {
    const result = subtitleCueSchema.safeParse({
      id: 'c1',
      startTime: 0,
      endTime: 2,
      text: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects cue missing required fields', () => {
    const result = subtitleCueSchema.safeParse({ id: 'c1' });
    expect(result.success).toBe(false);
  });
});

describe('subtitleStyleSchema', () => {
  it('accepts valid style', () => {
    const result = subtitleStyleSchema.safeParse({
      fontFamily: 'Arial',
      fontSize: 24,
      fontColor: '#ffffff',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty style', () => {
    const result = subtitleStyleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex color', () => {
    const result = subtitleStyleSchema.safeParse({
      fontColor: 'red',
    });
    expect(result.success).toBe(false);
  });

  it('rejects fontSize out of range', () => {
    expect(subtitleStyleSchema.safeParse({ fontSize: 0 }).success).toBe(false);
    expect(subtitleStyleSchema.safeParse({ fontSize: 201 }).success).toBe(false);
  });

  it('rejects outlineWidth out of range', () => {
    expect(subtitleStyleSchema.safeParse({ outlineWidth: -1 }).success).toBe(false);
    expect(subtitleStyleSchema.safeParse({ outlineWidth: 11 }).success).toBe(false);
  });
});

describe('saveSubtitlesSchema', () => {
  it('accepts valid body', () => {
    const result = saveSubtitlesSchema.safeParse({
      cues: [{ id: 'c1', startTime: 0, endTime: 2, text: 'Hello' }],
      style: { fontSize: 24 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts body without style', () => {
    const result = saveSubtitlesSchema.safeParse({
      cues: [{ id: 'c1', startTime: 0, endTime: 2, text: 'OK' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects too many cues', () => {
    const cues = Array.from({ length: 5001 }, (_, i) => ({
      id: `c${i}`,
      startTime: i,
      endTime: i + 1,
      text: 'X',
    }));
    const result = saveSubtitlesSchema.safeParse({ cues });
    expect(result.success).toBe(false);
  });

  it('rejects missing cues', () => {
    const result = saveSubtitlesSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('createRenderSchema', () => {
  it('accepts valid UUID', () => {
    const result = createRenderSchema.safeParse({
      videoId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID string', () => {
    const result = createRenderSchema.safeParse({ videoId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing videoId', () => {
    const result = createRenderSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
