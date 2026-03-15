import { describe, it, expect, vi, beforeEach } from 'vitest';
import { groupWordsIntoCues } from '../word-grouper';
import type { TranscriptionWord } from '../types';

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

beforeEach(() => {
  uuidCounter = 0;
});

const makeWords = (texts: string[], startOffset = 0, wordDuration = 0.5): TranscriptionWord[] =>
  texts.map((text, i) => ({
    text,
    startTime: startOffset + i * wordDuration,
    endTime: startOffset + (i + 1) * wordDuration,
  }));

describe('groupWordsIntoCues', () => {
  it('returns empty array for no words', () => {
    expect(groupWordsIntoCues([])).toEqual([]);
  });

  it('groups words into a single cue when under limits', () => {
    const words = makeWords(['Hello', 'world']);
    const cues = groupWordsIntoCues(words);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello world');
    expect(cues[0].words).toHaveLength(2);
    expect(cues[0].animationStyle).toBe('karaoke');
  });

  it('splits on maxWordsPerCue', () => {
    const words = makeWords(Array.from({ length: 15 }, (_, i) => `w${i}`));
    const cues = groupWordsIntoCues(words, { maxWordsPerCue: 5 });
    expect(cues).toHaveLength(3);
    expect(cues[0].words).toHaveLength(5);
    expect(cues[1].words).toHaveLength(5);
    expect(cues[2].words).toHaveLength(5);
  });

  it('splits on maxDurationPerCue', () => {
    const words = makeWords(['Hello', 'beautiful', 'world'], 0, 3); // each word 3s
    const cues = groupWordsIntoCues(words, { maxDurationPerCue: 5 });
    // First cue: "Hello" (0-3), second word would make duration 6 > 5, so split
    expect(cues.length).toBeGreaterThanOrEqual(2);
  });

  it('breaks on sentence-ending punctuation', () => {
    const words = makeWords(['Hello', 'world.', 'How', 'are', 'you?']);
    const cues = groupWordsIntoCues(words, { breakOnPunctuation: true });
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello world.');
    expect(cues[1].text).toBe('How are you?');
  });

  it('does not break on punctuation when disabled', () => {
    const words = makeWords(['Hello', 'world.', 'Goodbye.']);
    const cues = groupWordsIntoCues(words, { breakOnPunctuation: false });
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello world. Goodbye.');
  });

  it('preserves per-word timing data', () => {
    const words: TranscriptionWord[] = [
      { text: 'Hello', startTime: 0, endTime: 0.5 },
      { text: 'world', startTime: 0.5, endTime: 1.0 },
    ];
    const cues = groupWordsIntoCues(words);
    expect(cues[0].words![0]).toEqual({ text: 'Hello', startTime: 0, endTime: 0.5 });
    expect(cues[0].words![1]).toEqual({ text: 'world', startTime: 0.5, endTime: 1.0 });
  });

  it('uses custom animation style', () => {
    const words = makeWords(['Hello', 'world']);
    const cues = groupWordsIntoCues(words, {}, 'word-highlight');
    expect(cues[0].animationStyle).toBe('word-highlight');
  });

  it('sets cue startTime and endTime from word boundaries', () => {
    const words: TranscriptionWord[] = [
      { text: 'Hello', startTime: 1.5, endTime: 2.0 },
      { text: 'world', startTime: 2.0, endTime: 2.7 },
    ];
    const cues = groupWordsIntoCues(words);
    expect(cues[0].startTime).toBe(1.5);
    expect(cues[0].endTime).toBe(2.7);
  });

  it('handles single-word punctuation gracefully', () => {
    const words = makeWords(['Hello.']);
    const cues = groupWordsIntoCues(words);
    // Should not break because there's only 1 word (< 2 required for punctuation break)
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello.');
  });

  describe('orphan avoidance', () => {
    it('moves trailing orphan word to next cue', () => {
      const words = makeWords(['Zobacz', 'jak', 'w', 'trzydzieści', 'sekund']);
      const cues = groupWordsIntoCues(words, { maxWordsPerCue: 3, avoidOrphans: true });
      // Without orphan fix: ["Zobacz jak w", "trzydzieści sekund"]
      // With orphan fix: ["Zobacz jak", "w trzydzieści sekund"]
      expect(cues[0].text).toBe('Zobacz jak');
      expect(cues[1].text).toBe('w trzydzieści sekund');
    });

    it('moves Polish preposition orphan', () => {
      const words = makeWords(['aplikację', 'i', 'od', 'razu', 'ją']);
      const cues = groupWordsIntoCues(words, { maxWordsPerCue: 2, avoidOrphans: true });
      // Cue boundaries: ["aplikację i"] -> orphan "i" -> ["aplikację", "i od"]
      // Then "od" at end of cue 2 -> ["i", "od razu"]... depends on grouping
      // Key: no cue ends with a short orphan word
      for (let i = 0; i < cues.length - 1; i++) {
        const lastWord = cues[i].words![cues[i].words!.length - 1].text;
        const clean = lastWord.replace(/[.,!?;:]/g, '').toLowerCase();
        if (clean.length <= 3) {
          expect(['aplikację', 'razu', 'ją']).toContain(clean);
        }
      }
    });

    it('does not move orphan if cue has only one word', () => {
      const words = makeWords(['w', 'domu']);
      const cues = groupWordsIntoCues(words, { maxWordsPerCue: 1, avoidOrphans: true });
      // Can't move orphan from single-word cue (would leave it empty)
      expect(cues.length).toBeGreaterThanOrEqual(1);
      expect(cues.every((c) => c.text.length > 0)).toBe(true);
    });

    it('preserves timing when moving orphan', () => {
      const words: TranscriptionWord[] = [
        { text: 'Zobacz', startTime: 0, endTime: 0.5 },
        { text: 'jak', startTime: 0.5, endTime: 0.8 },
        { text: 'w', startTime: 0.8, endTime: 0.9 },
        { text: 'trzydzieści', startTime: 0.9, endTime: 1.5 },
        { text: 'sekund', startTime: 1.5, endTime: 2.0 },
      ];
      const cues = groupWordsIntoCues(words, { maxWordsPerCue: 3, avoidOrphans: true });
      // "w" moved to next cue - its timing should be preserved
      expect(cues[0].endTime).toBe(0.8); // ends at "jak"
      expect(cues[1].startTime).toBe(0.8); // starts at "w"
      expect(cues[1].words![0].text).toBe('w');
    });

    it('does not fix orphans when disabled', () => {
      const words = makeWords(['Zobacz', 'jak', 'w', 'trzydzieści', 'sekund']);
      const cues = groupWordsIntoCues(words, { maxWordsPerCue: 3, avoidOrphans: false });
      expect(cues[0].text).toBe('Zobacz jak w');
    });
  });
});
