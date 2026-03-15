import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTimingReference, resolvePresetConfig } from '../base-orchestrator';

// ── renderVideo: compositionId routing ───────────────────────
// These tests guard against the bug where compositionId was ignored,
// causing all modes to render with the default 'Reel' composition.

const mockRender = vi.fn().mockResolvedValue({ durationMs: 100, sizeBytes: 1024 });

vi.mock('@reelstack/remotion/render', () => ({
  createRenderer: () => ({ render: mockRender }),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, mkdirSync: vi.fn() };
});

describe('renderVideo', () => {
  beforeEach(() => {
    mockRender.mockClear();
  });

  it('passes compositionId from props to renderer', async () => {
    const { renderVideo } = await import('../base-orchestrator');
    await renderVideo({ compositionId: 'ScreenExplainer', foo: 'bar' }, '/tmp/test-out.mp4');
    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ compositionId: 'ScreenExplainer' }),
    );
  });

  it('passes compositionId=VideoClip to renderer', async () => {
    const { renderVideo } = await import('../base-orchestrator');
    await renderVideo({ compositionId: 'VideoClip' }, '/tmp/test-out.mp4');
    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ compositionId: 'VideoClip' }),
    );
  });

  it('passes compositionId=PresenterExplainer to renderer', async () => {
    const { renderVideo } = await import('../base-orchestrator');
    await renderVideo({ compositionId: 'PresenterExplainer' }, '/tmp/test-out.mp4');
    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ compositionId: 'PresenterExplainer' }),
    );
  });

  it('passes undefined compositionId when not in props (renderer defaults to Reel)', async () => {
    const { renderVideo } = await import('../base-orchestrator');
    await renderVideo({ layout: 'fullscreen' }, '/tmp/test-out.mp4');
    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ compositionId: undefined }),
    );
  });
});

describe('buildTimingReference', () => {
  it('returns empty string for empty words array', () => {
    expect(buildTimingReference([])).toBe('');
  });

  it('groups words into sentences by punctuation', () => {
    const words = [
      { text: 'Hello', startTime: 0, endTime: 0.5 },
      { text: 'world.', startTime: 0.5, endTime: 1.0 },
      { text: 'How', startTime: 1.2, endTime: 1.5 },
      { text: 'are', startTime: 1.5, endTime: 1.8 },
      { text: 'you?', startTime: 1.8, endTime: 2.2 },
    ];
    const result = buildTimingReference(words);
    expect(result).toBe(
      '[0.0s-1.0s] Hello world.\n[1.2s-2.2s] How are you?',
    );
  });

  it('flushes remaining words without punctuation as final sentence', () => {
    const words = [
      { text: 'No', startTime: 0, endTime: 0.3 },
      { text: 'punctuation', startTime: 0.3, endTime: 0.8 },
    ];
    const result = buildTimingReference(words);
    expect(result).toBe('[0.0s-0.8s] No punctuation');
  });

  it('handles single word ending with period', () => {
    const words = [{ text: 'Done.', startTime: 5.0, endTime: 5.5 }];
    expect(buildTimingReference(words)).toBe('[5.0s-5.5s] Done.');
  });

  it('handles exclamation marks as sentence boundaries', () => {
    const words = [
      { text: 'Wow!', startTime: 0, endTime: 0.5 },
      { text: 'Cool.', startTime: 0.6, endTime: 1.0 },
    ];
    const result = buildTimingReference(words);
    expect(result).toBe('[0.0s-0.5s] Wow!\n[0.6s-1.0s] Cool.');
  });
});

describe('resolvePresetConfig', () => {
  it('returns defaults when no brand preset provided', () => {
    const config = resolvePresetConfig(undefined);
    expect(config.animationStyle).toBeDefined();
    expect(config.maxWordsPerCue).toBeGreaterThan(0);
    expect(config.maxDurationPerCue).toBeGreaterThan(0);
  });

  it('uses brand preset overrides when provided', () => {
    const config = resolvePresetConfig({
      animationStyle: 'karaoke',
      maxWordsPerCue: 2,
      maxDurationPerCue: 1.5,
    });
    expect(config.animationStyle).toBe('karaoke');
    expect(config.maxWordsPerCue).toBe(2);
    expect(config.maxDurationPerCue).toBe(1.5);
  });

  it('falls back to preset defaults for unspecified fields', () => {
    const config = resolvePresetConfig({ captionPreset: 'mrbeast' });
    expect(config.animationStyle).toBeDefined();
    expect(config.maxWordsPerCue).toBeGreaterThan(0);
  });
});
