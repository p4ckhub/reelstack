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
import { createTTSProvider, stripAudioTags } from '@reelstack/tts';
import type { TTSConfig } from '@reelstack/tts';
import { resolveTTSDefaults } from '../config/tts-defaults';
import { groupWordsIntoCues, alignWordsWithScript } from '@reelstack/transcription';
import {
  normalizeAudioForWhisper,
  getAudioDuration,
  transcribeAudio,
} from '@reelstack/remotion/pipeline';
import { createRenderer } from '@reelstack/remotion/render';
import { createDispatcher, type Runtime } from '@reelstack/renderer';
import { createStorage } from '@reelstack/storage';
import type { ProductionStep, BrandPreset, WhisperConfig } from '../types';
import { BUILT_IN_CAPTION_PRESETS, DEFAULT_CAPTION_PRESET } from '@reelstack/types';
import { addCost } from '../context';
import { calculateTTSCost, calculateWhisperCost } from '../config/pricing';

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
  /**
   * Text fed to TTS. May include audio tags (`[short pause]`) and phonetic
   * spellings (`en-osiem-en`) — those steer the synthesizer but MUST NOT
   * appear in captions.
   */
  script: string;
  /**
   * Optional clean text for caption display. When omitted, the pipeline
   * derives it from `script` by stripping audio tags. Callers that have
   * already applied phonetic conversion (e.g. `makeTTSFriendly()`) MUST
   * pass the original raw text here so captions show "n8n" not
   * "En-osiem-en", "Jeśli" not "[short pause] Jeśli".
   */
  displayScript?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai' | 'gemini-tts';
    voice?: string;
    language?: string;
    /**
     * Style steering for the provider (currently honored by Gemini TTS).
     * Build via `buildVoicePrompt()` in `@reelstack/tts`. Other providers ignore.
     */
    voicePrompt?: string;
  };
  whisper?: WhisperConfig;
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

  // Single source of truth for provider/voice/language defaults. Falls back
  // to gemini-tts when GEMINI_API_KEY is set, edge-tts when no keys at all.
  const ttsDefaults = resolveTTSDefaults({
    provider: request.tts?.provider,
    voice: request.tts?.voice,
    language: request.tts?.language,
  });
  const ttsConfig: TTSConfig = {
    provider: ttsDefaults.provider,
    apiKey:
      ttsDefaults.provider === 'elevenlabs'
        ? process.env.ELEVENLABS_API_KEY
        : ttsDefaults.provider === 'openai'
          ? process.env.OPENAI_API_KEY
          : ttsDefaults.provider === 'gemini-tts'
            ? // The provider itself also picks up GOOGLE_TTS_ACCESS_TOKEN
              // from env. We pass the API key here for the one-env-var path;
              // either auth route is enough to instantiate the client.
              (process.env.GOOGLE_TTS_API_KEY ?? process.env.GEMINI_API_KEY)
            : undefined,
    defaultLanguage: ttsDefaults.language,
  };
  const ttsProvider = createTTSProvider(ttsConfig);
  // Strip Gemini-style audio tags ([excitedly], [serious], …) for any
  // provider that doesn't understand them — edge-tts / OpenAI / ElevenLabs
  // would read the bracket contents literally otherwise. Gemini TTS keeps
  // the tags so it can steer delivery.
  const isGemini = ttsDefaults.provider === 'gemini-tts';
  const speechText = isGemini ? request.script : stripAudioTags(request.script);
  const ttsResult = await ttsProvider.synthesize(speechText, {
    voice: ttsDefaults.voice,
    language: ttsDefaults.language,
    voicePrompt: request.tts?.voicePrompt,
  });

  const voiceoverPath = path.join(tmpDir, `voiceover.${ttsResult.format}`);
  fs.writeFileSync(voiceoverPath, ttsResult.audioBuffer);

  const ttsDurationMs = performance.now() - ttsStart;
  steps.push({
    name: 'TTS',
    durationMs: ttsDurationMs,
    detail: `${ttsProvider.name}, ${(ttsResult.audioBuffer.length / 1024).toFixed(0)} KB`,
  });

  addCost({
    step: 'tts',
    provider: ttsProvider.name,
    type: 'tts',
    costUSD: calculateTTSCost(ttsConfig.provider, request.script.length),
    inputUnits: request.script.length,
    durationMs: ttsDurationMs,
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
    provider: request.whisper?.provider,
  });

  const whisperDurationMs = performance.now() - whisperStart;
  steps.push({
    name: 'Whisper transcription',
    durationMs: whisperDurationMs,
    detail: `${transcription.words.length} words`,
  });

  addCost({
    step: 'whisper',
    provider: request.whisper?.provider ?? 'cloudflare',
    type: 'transcription',
    costUSD: calculateWhisperCost(request.whisper?.provider ?? 'cloudflare', audioDuration),
    inputUnits: Math.round(audioDuration),
    durationMs: whisperDurationMs,
  });

  // Align Whisper output with the DISPLAY script — never the speech text.
  // The speech text (request.script when caller applied makeTTSFriendly /
  // kept audio tags) contains "en-osiem-en" and "[short pause]"; using it
  // for alignment puts those literal strings into captions. The display
  // text is the clean original — captions render "n8n" with the timing
  // Whisper detected for "en osiem en", redistributed proportionally by
  // alignWordsWithScript when token counts differ.
  const captionScript = request.displayScript ?? stripAudioTags(request.script);
  const alignedWords = captionScript
    ? alignWordsWithScript(transcription.words, captionScript)
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
  const cues = groupWordsIntoCues(offsetWords, {
    maxWordsPerCue: presetConfig.maxWordsPerCue,
    maxDurationPerCue: presetConfig.maxDurationPerCue,
    breakOnPunctuation: true,
  });

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

// Lazily-built renderer dispatcher — both runtimes registered, picked
// per-call by `runtime` argument. Cheap to build (just adapter instances)
// but we memoize so workers don't rebuild it per job.
let _dispatcher: ReturnType<typeof createDispatcher> | null = null;
function getDispatcher() {
  if (!_dispatcher) {
    _dispatcher = createDispatcher();
  }
  return _dispatcher;
}

/**
 * Render a composition and return the output path + timing step.
 *
 * Runtime defaults to `'remotion'` so every existing call site keeps
 * working unchanged. Modules that declare `runtime: 'hyperframes'`
 * pass it in via the module orchestrator.
 */
export async function renderVideo(
  props: Record<string, unknown>,
  outputPath?: string,
  onProgress?: (msg: string) => void,
  runtime: Runtime = 'remotion'
): Promise<RenderResult> {
  onProgress?.('Rendering video...');
  const finalPath =
    outputPath ?? path.join(os.tmpdir(), 'remotion-out', `reel-${randomUUID()}.mp4`);
  const compositionId = typeof props.compositionId === 'string' ? props.compositionId : 'Reel';

  const renderResult = await getDispatcher().render(
    runtime,
    { composition: compositionId, variables: props },
    { outputPath: finalPath }
  );

  return {
    outputPath: finalPath,
    step: {
      name: runtime === 'hyperframes' ? 'Hyperframes render' : 'Remotion render',
      durationMs: renderResult.durationMs,
      detail: `${finalPath} (${(renderResult.sizeBytes / 1024).toFixed(0)} KB)`,
    },
  };
}

// Keep the old createRenderer export alive so scripts/demo/agent-reel.ts
// and other direct callers continue to work. New code should prefer
// renderVideo() with a runtime argument, or use the dispatcher directly.
export { createRenderer };
