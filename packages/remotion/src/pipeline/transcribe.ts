import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { TranscriptionWord } from '@reelstack/transcription';
import { createLogger } from '@reelstack/logger';

const log = createLogger('transcribe');

interface TranscribeOptions {
  apiKey?: string;
  language?: string;
  /** Known script text — enables synthetic timing fallback when no API key */
  text?: string;
  /** Audio duration in seconds — required for synthetic timing */
  durationSeconds?: number;
}

const ALLOWED_LANGS = [
  'pl',
  'en',
  'es',
  'de',
  'fr',
  'it',
  'pt',
  'nl',
  'ru',
  'uk',
  'cs',
  'sk',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
  'sv',
  'da',
  'no',
  'fi',
  'hu',
  'ro',
  'bg',
  'hr',
  'sr',
  'sl',
  'et',
  'lv',
  'lt',
  'tr',
  'vi',
  'th',
  'id',
  'ms',
  'he',
  'el',
  'ka',
  'auto',
];

const WHISPER_CPP_MODEL_DIRS = [
  path.join(os.homedir(), '.local/share/whisper-cpp'),
  '/usr/local/share/whisper-cpp',
  '/opt/homebrew/share/whisper-cpp',
];

const WHISPER_CPP_MODEL_PREFERENCE = [
  'ggml-large-v3-turbo.bin',
  'ggml-large-v3.bin',
  'ggml-large.bin',
  'ggml-medium.bin',
  'ggml-small.bin',
  'ggml-base.bin',
  'ggml-tiny.bin',
];

/**
 * Server-side transcription with automatic fallback chain:
 * 1. OpenAI Whisper API (OPENAI_API_KEY) — cloud, accurate, costs money
 * 2. whisper.cpp local (whisper-cli binary) — free, fast on Apple Silicon, word-level timestamps
 * 3. Synthetic timing — distributes known words proportionally (no transcription needed)
 */
export async function transcribeAudio(
  wavBuffer: Buffer,
  options?: TranscribeOptions
): Promise<{ words: TranscriptionWord[]; text: string; duration: number }> {
  // 1. OpenAI Whisper API
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (apiKey) {
    return transcribeViaApi(wavBuffer, apiKey, options);
  }

  // 2. whisper.cpp local
  const whisperResult = transcribeViaWhisperCpp(wavBuffer, options?.language);
  if (whisperResult) {
    return whisperResult;
  }

  // 3. Synthetic timing from known text
  log.warn('No API key or whisper-cli available, using synthetic timing');
  if (options?.text && options?.durationSeconds) {
    return syntheticTranscribe(options.text, options.durationSeconds);
  }

  throw new Error(
    'Transcription requires one of: OPENAI_API_KEY, whisper-cli (brew install whisper-cpp), ' +
      'or known script text for synthetic timing'
  );
}

// ── whisper.cpp ──────────────────────────────────────────

function findWhisperModel(): string | null {
  const envModel = process.env.WHISPER_CPP_MODEL;
  if (envModel && fs.existsSync(envModel)) return envModel;

  for (const dir of WHISPER_CPP_MODEL_DIRS) {
    for (const model of WHISPER_CPP_MODEL_PREFERENCE) {
      const modelPath = path.join(dir, model);
      if (fs.existsSync(modelPath)) return modelPath;
    }
  }
  return null;
}

function isWhisperCppAvailable(): boolean {
  try {
    execFileSync('which', ['whisper-cli'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Transcribe via whisper.cpp CLI with word-level timestamps.
 * Returns null if whisper-cli is not available or no model found.
 */
function transcribeViaWhisperCpp(
  wavBuffer: Buffer,
  language?: string
): { words: TranscriptionWord[]; text: string; duration: number } | null {
  if (!isWhisperCppAvailable()) return null;

  const modelPath = findWhisperModel();
  if (!modelPath) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cpp-'));
  const wavPath = path.join(tmpDir, 'audio.wav');
  const jsonPath = path.join(tmpDir, 'audio.json');

  try {
    fs.writeFileSync(wavPath, wavBuffer);

    const rawLang = language?.split('-')[0] ?? 'pl';
    const lang = ALLOWED_LANGS.includes(rawLang) ? rawLang : 'pl';
    execFileSync(
      'whisper-cli',
      [
        '-m',
        modelPath,
        '-f',
        wavPath,
        '-l',
        lang,
        '--output-json-full',
        '-of',
        path.join(tmpDir, 'audio'),
        '--no-prints',
      ],
      { stdio: 'pipe', timeout: 120_000 }
    );

    if (!fs.existsSync(jsonPath)) return null;

    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as WhisperCppJson;
    const result = parseWhisperCppJson(json);
    return result;
  } catch {
    return null; // Fall through to next fallback
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

interface WhisperCppJson {
  transcription: Array<{
    timestamps: { from: string; to: string };
    offsets: { from: number; to: number };
    text: string;
    tokens: Array<{
      text: string;
      timestamps: { from: string; to: string };
      offsets: { from: number; to: number };
    }>;
  }>;
}

/**
 * Merges sub-word tokens into full words.
 * whisper.cpp tokens use a leading space to mark word boundaries:
 *   " C" + "ze" + "ść" → "Cześć"
 *   " ur" + "uch" + "omi" + "ć" → "uruchomić"
 * Punctuation-only tokens (!, ., ,) are appended to the previous word.
 */
export function parseWhisperCppJson(json: WhisperCppJson): {
  words: TranscriptionWord[];
  text: string;
  duration: number;
} {
  // First pass: collect raw tokens
  const rawTokens: Array<{ text: string; from: number; to: number }> = [];
  for (const segment of json.transcription) {
    for (const token of segment.tokens) {
      if (!token.text || token.text.startsWith('[')) continue;
      rawTokens.push({
        text: token.text,
        from: token.offsets.from / 1000,
        to: token.offsets.to / 1000,
      });
    }
  }

  // Second pass: merge tokens into words
  // A new word starts when token.text has a leading space
  const words: TranscriptionWord[] = [];
  let currentText = '';
  let currentStart = 0;
  let currentEnd = 0;

  for (const token of rawTokens) {
    const hasLeadingSpace = token.text.startsWith(' ');
    const stripped = token.text.trim();
    if (!stripped) continue;

    const isPunctuation = /^[.,!?;:…]+$/.test(stripped);

    if (hasLeadingSpace && currentText && !isPunctuation) {
      // Flush previous word
      words.push({ text: currentText, startTime: currentStart, endTime: currentEnd });
      currentText = stripped;
      currentStart = token.from;
      currentEnd = token.to;
    } else if (currentText) {
      // Continue current word (sub-token or punctuation)
      currentText += stripped;
      if (token.to > currentEnd) currentEnd = token.to;
    } else {
      // First token
      currentText = stripped;
      currentStart = token.from;
      currentEnd = token.to;
    }
  }

  // Flush last word
  if (currentText) {
    words.push({ text: currentText, startTime: currentStart, endTime: currentEnd });
  }

  const maxEnd = words.length > 0 ? words[words.length - 1].endTime : 0;

  return {
    words,
    text: words.map((w) => w.text).join(' '),
    duration: maxEnd,
  };
}

// ── Synthetic timing ─────────────────────────────────────

/**
 * Distributes words proportionally across audio duration.
 * Weights each word by character length for natural spacing.
 */
export function syntheticTranscribe(
  text: string,
  durationSeconds: number
): { words: TranscriptionWord[]; text: string; duration: number } {
  const rawWords = text.split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) {
    return { words: [], text, duration: durationSeconds };
  }

  const totalChars = rawWords.reduce((sum, w) => sum + w.length, 0);
  const paddingPerWord = 0.05; // 50ms gap between words
  const totalPadding = paddingPerWord * rawWords.length;
  const usableDuration = Math.max(durationSeconds - totalPadding, durationSeconds * 0.8);

  let cursor = 0;
  const words: TranscriptionWord[] = rawWords.map((word) => {
    const weight = word.length / totalChars;
    const wordDuration = usableDuration * weight;
    const startTime = cursor;
    const endTime = cursor + wordDuration;
    cursor = endTime + paddingPerWord;
    return { text: word, startTime, endTime };
  });

  return { words, text, duration: durationSeconds };
}

// ── OpenAI Whisper API ───────────────────────────────────

async function transcribeViaApi(
  wavBuffer: Buffer,
  apiKey: string,
  options?: TranscribeOptions
): Promise<{ words: TranscriptionWord[]; text: string; duration: number }> {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }),
    'audio.wav'
  );
  formData.append('model', 'gpt-4o-transcribe');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  if (options?.language) {
    formData.append('language', options.language);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as WhisperApiResponse;

  const words: TranscriptionWord[] = (data.words ?? []).map((w) => ({
    text: w.word,
    startTime: w.start,
    endTime: w.end,
  }));

  return {
    words,
    text: data.text,
    duration: data.duration ?? 0,
  };
}

interface WhisperApiResponse {
  text: string;
  duration?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}
