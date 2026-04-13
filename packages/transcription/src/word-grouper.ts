/**
 * Word Grouper - groups transcription words into SubtitleCue objects.
 * Inspired by OpenReel's transcription-service.ts:262-308.
 */
import type { SubtitleCue } from '@reelstack/types';
import type { TranscriptionWord, WordGroupingConfig } from './types';
import { DEFAULT_GROUPING_CONFIG, ORPHAN_WORDS } from './types';

/**
 * Group transcription words into subtitle cues with per-word timing.
 */
export function groupWordsIntoCues(
  words: readonly TranscriptionWord[],
  config: Partial<WordGroupingConfig> = {}
): SubtitleCue[] {
  if (words.length === 0) return [];

  const { maxWordsPerCue, maxDurationPerCue, breakOnPunctuation, avoidOrphans } = {
    ...DEFAULT_GROUPING_CONFIG,
    ...config,
  };

  const cues: SubtitleCue[] = [];
  let currentWords: TranscriptionWord[] = [];
  let groupStart = 0;

  for (const word of words) {
    if (currentWords.length === 0) {
      groupStart = word.startTime;
    }

    const wouldExceedWords = currentWords.length >= maxWordsPerCue;
    const wouldExceedDuration = word.endTime - groupStart > maxDurationPerCue;

    // Check if PREVIOUS word ended with punctuation — if so, flush before adding new word.
    // This prevents "dzień. Zmiana" spanning across sentences.
    const prevWord = currentWords.length > 0 ? currentWords[currentWords.length - 1] : null;
    const prevEndedSentence = breakOnPunctuation && prevWord && /[.!?]$/.test(prevWord.text);

    if (prevEndedSentence && currentWords.length >= 1) {
      cues.push(createCueFromWords(currentWords));
      currentWords = [word];
      groupStart = word.startTime;
    } else if ((wouldExceedWords || wouldExceedDuration) && currentWords.length > 0) {
      // Flush group if limits exceeded
      cues.push(createCueFromWords(currentWords));
      currentWords = [word];
      groupStart = word.startTime;
    } else {
      currentWords.push(word);
    }
  }

  // Flush remaining words
  if (currentWords.length > 0) {
    cues.push(createCueFromWords(currentWords));
  }

  // Post-process: fix orphans by moving trailing short words to next cue
  if (avoidOrphans) {
    fixOrphans(cues);
  }

  return cues;
}

/**
 * Move orphan words (short prepositions/conjunctions) from end of cue to start of next cue.
 * Mutates the cues array in place.
 */
function fixOrphans(cues: SubtitleCue[]): void {
  for (let i = 0; i < cues.length - 1; i++) {
    const cue = cues[i];
    const words = cue.words;
    if (!words || words.length <= 1) continue;

    const lastWord = words[words.length - 1];
    const cleanWord = lastWord.text.replace(/[.,!?;:]/g, '').toLowerCase();

    if (!ORPHAN_WORDS.has(cleanWord)) continue;

    // Move last word from this cue to start of next cue
    const nextCue = cues[i + 1];
    const nextWords = nextCue.words;
    if (!nextWords) continue;

    const keptWords = words.slice(0, -1);
    const movedWords = [lastWord, ...nextWords];

    cues[i] = {
      ...cue,
      text: keptWords
        .map((w) => w.text)
        .join(' ')
        .trim(),
      endTime: keptWords[keptWords.length - 1].endTime,
      words: keptWords.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
    };

    cues[i + 1] = {
      ...nextCue,
      text: movedWords
        .map((w) => w.text)
        .join(' ')
        .trim(),
      startTime: lastWord.startTime,
      words: movedWords.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
    };
  }
}

function createCueFromWords(words: TranscriptionWord[]): SubtitleCue {
  const text = words
    .map((w) => w.text)
    .join(' ')
    .trim();
  const startTime = words[0].startTime;
  const endTime = words[words.length - 1].endTime;

  return {
    id: crypto.randomUUID(),
    text,
    startTime,
    endTime,
    words: words.map((w) => ({
      text: w.text,
      startTime: w.startTime,
      endTime: w.endTime,
    })),
  };
}
