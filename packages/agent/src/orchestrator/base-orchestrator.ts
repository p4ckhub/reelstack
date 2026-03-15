/**
 * Base orchestrator: shared pipeline steps reused across all production modes.
 *
 * Exports pure helpers (buildTimingReference, resolvePresetConfig) and
 * side-effectful pipeline stages (runTTSPipeline, uploadVoiceover, renderVideo).
 */
import { randomUUID } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTTSProvider } from '@reelstack/tts';
import type { TTSConfig } from '@reelstack/tts';
import { groupWordsIntoCues, alignWordsWithScript } from '@reelstack/transcription';
import {
  normalizeAudioForWhisper,
  getAudioDuration,
  transcribeAudio,
} from '@reelstack/remotion/pipeline';
import { createRenderer } from '@reelstack/remotion/render';
import { createStorage } from '@reelstack/storage';
import type { ProductionStep, BrandPreset } from '../types';
import { BUILT_IN_CAPTION_PRESETS, DEFAULT_CAPTION_PRESET } from '@reelstack/types';

// ── Pure helpers ──────────────────────────────────────────────

/**
 * Groups transcription words into sentences and formats as timestamped lines.
 * Output: "[0.0s-4.5s] First sentence here.\n[4.5s-8.2s] Second sentence."
 * This gives the LLM director exact speech timing to plan visual elements against.
 */
export function buildTimingReference(
  words: Array<{ text: string; startTime: number; endTime: number }>
): string {
  if (words.length === 0) return '';
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let current: typeof words = [];

  for (const word of words) {
    current.push(word);
    if (/[.!?]$/.test(word.text.trim())) {
      sentences.push({
        text: current.map((w) => w.text).join(' '),
        start: current[0].startTime,
        end: current[current.length - 1].endTime,
      });
      current = [];
    }
  }
  if (current.length > 0) {
    sentences.push({
      text: current.map((w) => w.text).join(' '),
      start: current[0].startTime,
      end: current[current.length - 1].endTime,
    });
  }

  return sentences.map((s) => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`).join('\n');
}

/** Resolve animation style and word grouping from brand preset */
export function resolvePresetConfig(brandPreset?: BrandPreset) {
  const presetName = brandPreset?.captionPreset ?? DEFAULT_CAPTION_PRESET;
  const preset =
    BUILT_IN_CAPTION_PRESETS[presetName] ?? BUILT_IN_CAPTION_PRESETS[DEFAULT_CAPTION_PRESET];
  return {
    animationStyle: brandPreset?.animationStyle ?? preset.animationStyle,
    maxWordsPerCue: brandPreset?.maxWordsPerCue ?? preset.maxWordsPerCue,
    maxDurationPerCue: brandPreset?.maxDurationPerCue ?? preset.maxDurationPerCue,
  };
}

// ── TTS Pipeline ──────────────────────────────────────────────

export interface TTSPipelineResult {
  voiceoverPath: string;
  audioDuration: number;
  transcriptionWords: Array<{ text: string; startTime: number; endTime: number }>;
  cues: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
    animationStyle?:
      | 'none'
      | 'word-highlight'
      | 'word-by-word'
      | 'karaoke'
      | 'bounce'
      | 'typewriter';
  }>;
  steps: ProductionStep[];
}

export interface TTSPipelineInput {
  script: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai';
    voice?: string;
    language?: string;
  };
  whisper?: {
    provider?: 'openrouter' | 'cloudflare' | 'ollama';
    apiKey?: string;
  };
  brandPreset?: BrandPreset;
}

export async function runTTSPipeline(
  request: TTSPipelineInput,
  tmpDir: string,
  onProgress?: (msg: string) => void
): Promise<TTSPipelineResult> {
  const steps: ProductionStep[] = [];

  // TTS
  onProgress?.('Generating voiceover...');
  const ttsStart = performance.now();

  const ttsConfig: TTSConfig = {
    provider: request.tts?.provider ?? 'edge-tts',
    apiKey:
      request.tts?.provider === 'elevenlabs'
        ? process.env.ELEVENLABS_API_KEY
        : request.tts?.provider === 'openai'
          ? process.env.OPENAI_API_KEY
          : undefined,
    defaultLanguage: request.tts?.language ?? 'en-US',
  };
  const ttsProvider = createTTSProvider(ttsConfig);
  const ttsResult = await ttsProvider.synthesize(request.script, {
    voice: request.tts?.voice,
    language: request.tts?.language,
  });

  const voiceoverPath = path.join(tmpDir, `voiceover.${ttsResult.format}`);
  fs.writeFileSync(voiceoverPath, ttsResult.audioBuffer);

  steps.push({
    name: 'TTS',
    durationMs: performance.now() - ttsStart,
    detail: `${ttsProvider.name}, ${(ttsResult.audioBuffer.length / 1024).toFixed(0)} KB`,
  });

  // Normalize audio
  onProgress?.('Normalizing audio...');
  const normStart = performance.now();

  const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);
  const audioDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);

  steps.push({
    name: 'Audio normalization',
    durationMs: performance.now() - normStart,
    detail: `${audioDuration.toFixed(1)}s, 16kHz mono WAV`,
  });

  // Whisper transcription
  onProgress?.('Transcribing audio...');
  const whisperStart = performance.now();

  const transcription = await transcribeAudio(wavBuffer, {
    apiKey: request.whisper?.apiKey,
    language: request.tts?.language?.split('-')[0],
    text: request.script,
    durationSeconds: audioDuration,
  });

  steps.push({
    name: 'Whisper transcription',
    durationMs: performance.now() - whisperStart,
    detail: `${transcription.words.length} words`,
  });

  // Align Whisper output with original script text.
  // Whisper provides timings, but may mishear technical terms (e.g. "tsconfig" → "strictNTS").
  // Since we know the original text, replace Whisper's words with the correct ones.
  const alignedWords = request.script
    ? alignWordsWithScript(transcription.words, request.script)
    : [...transcription.words];

  // Validate: Whisper timestamps must not exceed audio duration significantly.
  // whisper.cpp sometimes hallucinates timestamps past the audio end.
  const lastWordEnd = alignedWords.length > 0 ? Math.max(...alignedWords.map((w) => w.endTime)) : 0;

  if (lastWordEnd > audioDuration * 1.3) {
    throw new Error(
      `Whisper timestamps (${lastWordEnd.toFixed(1)}s) exceed audio duration (${audioDuration.toFixed(1)}s) by ${((lastWordEnd / audioDuration - 1) * 100).toFixed(0)}%. Captions would be desynced. Try a different Whisper provider.`
    );
  }

  // Whisper word timestamps tend to be slightly early (words appear before spoken).
  // Apply a small forward offset to compensate.
  const WHISPER_OFFSET = 0.12; // seconds — tuned empirically with edge-tts
  const offsetWords = alignedWords.map((w) => ({
    ...w,
    startTime: w.startTime + WHISPER_OFFSET,
    endTime: w.endTime + WHISPER_OFFSET,
  }));

  // Group into cues using preset config
  const presetConfig = resolvePresetConfig(request.brandPreset);
  const cues = groupWordsIntoCues(
    offsetWords,
    {
      maxWordsPerCue: presetConfig.maxWordsPerCue,
      maxDurationPerCue: presetConfig.maxDurationPerCue,
      breakOnPunctuation: true,
    },
    presetConfig.animationStyle
  );

  return {
    voiceoverPath,
    audioDuration,
    transcriptionWords: offsetWords.map((w) => ({
      text: w.text,
      startTime: w.startTime,
      endTime: w.endTime,
    })),
    cues: cues.map((c) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: c.words?.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    })),
    steps,
  };
}

// ── Voiceover upload ──────────────────────────────────────────

/**
 * Upload voiceover to object storage and return a signed URL.
 * Used by all modes that need Lambda or remote render to access audio.
 */
export async function uploadVoiceover(voiceoverPath: string, ttlSeconds = 7200): Promise<string> {
  const voiceoverKey = `voiceovers/voiceover-${randomUUID()}.mp3`;
  const storage = await createStorage();
  await storage.upload(fs.readFileSync(voiceoverPath), voiceoverKey);
  return storage.getSignedUrl(voiceoverKey, ttlSeconds);
}

// ── Render ────────────────────────────────────────────────────

export interface RenderResult {
  outputPath: string;
  step: ProductionStep;
}

/**
 * Render a Remotion composition and return the output path + timing step.
 */
export async function renderVideo(
  props: Record<string, unknown>,
  outputPath?: string,
  onProgress?: (msg: string) => void
): Promise<RenderResult> {
  onProgress?.('Rendering video...');
  const finalPath =
    outputPath ?? path.join(os.tmpdir(), 'remotion-out', `reel-${randomUUID()}.mp4`);
  const compositionId = typeof props.compositionId === 'string' ? props.compositionId : undefined;
  const renderer = createRenderer();
  const renderResult = await renderer.render(props as never, {
    outputPath: finalPath,
    compositionId,
  });

  return {
    outputPath: finalPath,
    step: {
      name: 'Remotion render',
      durationMs: renderResult.durationMs,
      detail: `${finalPath} (${(renderResult.sizeBytes / 1024).toFixed(0)} KB)`,
    },
  };
}
