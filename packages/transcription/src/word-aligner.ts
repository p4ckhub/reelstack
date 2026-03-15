/**
 * Word Aligner — replaces Whisper transcription text with original script text,
 * keeping Whisper's word-level timings.
 *
 * Strategy:
 * 1. Same word count → 1:1 text replacement (timings perfect)
 * 2. Different counts → match from start and end (like git diff),
 *    only redistribute the mismatched middle section
 */
import type { TranscriptionWord } from './types';

/**
 * Align Whisper transcription words with original script.
 * Returns new word array with original text + Whisper timings.
 */
export function alignWordsWithScript(
  whisperWords: readonly TranscriptionWord[],
  originalScript: string
): TranscriptionWord[] {
  if (!originalScript || whisperWords.length === 0) return [...whisperWords];

  // Split on whitespace, keeping punctuation attached to words.
  // "Hello, world." → ["Hello,", "world."]
  const scriptWords = originalScript.split(/\s+/).filter(Boolean);

  if (scriptWords.length === 0) return [...whisperWords];

  // Same count → 1:1 replacement (best case)
  if (scriptWords.length === whisperWords.length) {
    return whisperWords.map((w, i) => ({
      ...w,
      text: scriptWords[i]!,
    }));
  }

  // Different counts → match common prefix + suffix, redistribute middle
  return diffAlign(whisperWords, scriptWords);
}

/**
 * Fuzzy word match (case-insensitive, ignoring punctuation).
 */
function wordsMatch(a: string, b: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean(a) === clean(b);
}

/**
 * Match words from start and end (common prefix/suffix),
 * then redistribute the mismatched middle proportionally.
 */
function diffAlign(
  whisperWords: readonly TranscriptionWord[],
  scriptWords: string[]
): TranscriptionWord[] {
  const wLen = whisperWords.length;
  const sLen = scriptWords.length;

  // Find common prefix (matching words from start)
  let prefixLen = 0;
  while (
    prefixLen < wLen &&
    prefixLen < sLen &&
    wordsMatch(whisperWords[prefixLen].text, scriptWords[prefixLen])
  ) {
    prefixLen++;
  }

  // Find common suffix (matching words from end)
  let suffixLen = 0;
  while (
    suffixLen < wLen - prefixLen &&
    suffixLen < sLen - prefixLen &&
    wordsMatch(whisperWords[wLen - 1 - suffixLen].text, scriptWords[sLen - 1 - suffixLen])
  ) {
    suffixLen++;
  }

  const result: TranscriptionWord[] = [];

  // Prefix: 1:1 replacement with Whisper timings (perfect sync)
  for (let i = 0; i < prefixLen; i++) {
    result.push({ ...whisperWords[i], text: scriptWords[i]! });
  }

  // Middle: the mismatched section — redistribute proportionally
  const wMidStart = prefixLen;
  const wMidEnd = wLen - suffixLen;
  const sMidStart = prefixLen;
  const sMidEnd = sLen - suffixLen;

  const midWhisperWords = whisperWords.slice(wMidStart, wMidEnd);
  const midScriptWords = scriptWords.slice(sMidStart, sMidEnd);

  if (midScriptWords.length > 0 && midWhisperWords.length > 0) {
    const midStart = midWhisperWords[0].startTime;
    const midEnd = midWhisperWords[midWhisperWords.length - 1].endTime;
    const midDuration = midEnd - midStart;
    const totalChars = midScriptWords.reduce((sum, w) => sum + Math.max(w.length, 1), 0);

    let cursor = midStart;
    for (let i = 0; i < midScriptWords.length; i++) {
      const weight = Math.max(midScriptWords[i].length, 1) / totalChars;
      const endTime = i === midScriptWords.length - 1 ? midEnd : cursor + midDuration * weight;
      result.push({
        text: midScriptWords[i],
        startTime: cursor,
        endTime,
      });
      cursor = endTime;
    }
  } else if (midScriptWords.length > 0) {
    // No whisper words in middle — interpolate from boundaries
    const prevEnd = result.length > 0 ? result[result.length - 1].endTime : 0;
    const nextStart = suffixLen > 0 ? whisperWords[wLen - suffixLen].startTime : prevEnd + 0.5;
    const gap = nextStart - prevEnd;
    const totalChars = midScriptWords.reduce((sum, w) => sum + Math.max(w.length, 1), 0);
    let cursor = prevEnd;
    for (let i = 0; i < midScriptWords.length; i++) {
      const weight = Math.max(midScriptWords[i].length, 1) / totalChars;
      const endTime = cursor + gap * weight;
      result.push({ text: midScriptWords[i], startTime: cursor, endTime });
      cursor = endTime;
    }
  }

  // Suffix: 1:1 replacement with Whisper timings (perfect sync)
  for (let i = 0; i < suffixLen; i++) {
    const wIdx = wLen - suffixLen + i;
    const sIdx = sLen - suffixLen + i;
    result.push({ ...whisperWords[wIdx], text: scriptWords[sIdx]! });
  }

  return result;
}
