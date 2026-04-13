/**
 * Slideshow orchestrator.
 *
 * Pipeline: [LLM script | manual slides] → image-gen PNGs → per-slide TTS → whisper → compose → render.
 *
 * Zero external API keys required: uses @reelstack/image-gen (Playwright) + edge-tts (free).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderToFile } from '@reelstack/image-gen';
import { uploadVoiceover, renderVideo, resolvePresetConfig } from '@reelstack/agent';
import type { ProductionStep } from '@reelstack/agent';
import { createTTSProvider } from '@reelstack/tts';
import type { TTSConfig } from '@reelstack/tts';
import { groupWordsIntoCues, alignWordsWithScript } from '@reelstack/transcription';
import {
  normalizeAudioForWhisper,
  getAudioDuration,
  transcribeAudio,
} from '@reelstack/remotion/pipeline';
import { createStorage } from '@reelstack/storage';
import { createLogger } from '@reelstack/logger';
import { generateSlideshowScript, wrapManualSlides } from './script-generator';
import type { SlideshowRequest, SlideshowResult, SlideshowScript } from './types';
import type { SlideshowProps } from './remotion/schema';

const baseLog = createLogger('slideshow');

/** Default background music (served from Remotion public/ dir). */
const DEFAULT_MUSIC_PATH = 'music/bg-upbeat.mp3';
const DEFAULT_MUSIC_VOLUME = 0.13;

// ── Props builder (pure, testable) ──────────────────────────

export interface BuildSlideshowPropsInput {
  script: SlideshowScript;
  imageUrls: string[];
  cues: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
  }>;
  /** Exact per-slide boundary times (cumulative durations). Length = slides + 1. */
  slideBoundaries: number[];
  voiceoverUrl: string;
  durationSeconds: number;
  musicUrl?: string;
  musicVolume?: number;
  highlightMode?: string;
}

export function buildSlideshowProps(input: BuildSlideshowPropsInput): SlideshowProps {
  const {
    imageUrls,
    cues,
    slideBoundaries,
    voiceoverUrl,
    durationSeconds,
    musicUrl,
    musicVolume,
    highlightMode,
  } = input;

  const TRANSITIONS = ['crossfade', 'slide-left', 'zoom-in', 'wipe', 'slide-right'] as const;

  const slides = imageUrls.map((url, i) => {
    const startTime = slideBoundaries[i] ?? (durationSeconds * i) / imageUrls.length;
    const endTime = slideBoundaries[i + 1] ?? durationSeconds;
    return {
      imageUrl: url,
      startTime,
      endTime,
      transition: i === 0 ? ('none' as const) : TRANSITIONS[(i - 1) % TRANSITIONS.length]!,
      transitionDurationMs: i === 0 ? 0 : 500,
    };
  });

  return {
    slides,
    cues,
    voiceoverUrl,
    musicUrl: musicUrl ?? DEFAULT_MUSIC_PATH,
    musicVolume: musicVolume ?? DEFAULT_MUSIC_VOLUME,
    durationSeconds,
    backgroundColor: '#000000',
    captionStyle: {
      fontSize: 60,
      fontColor: '#FFFFFF',
      fontWeight: 'bold' as const,
      ...(highlightMode ? { highlightMode } : {}),
      highlightColor: '#FFD700',
      position: 72,
      backgroundColor: '#000000',
      backgroundOpacity: 0.65,
      padding: 18,
      outlineWidth: 3,
      outlineColor: '#000000',
      shadowBlur: 8,
    },
  };
}

// ── Full pipeline ───────────────────────────────────────────

export async function produceSlideshow(request: SlideshowRequest): Promise<SlideshowResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-slideshow-'));
  const template = request.template ?? 'tip-card';
  const brand = request.brand ?? 'example';

  // ── 1. SCRIPT ──────────────────────────────────────────────
  let script: SlideshowScript;

  if (request.slides && request.slides.length > 0) {
    script = wrapManualSlides(request.topic, request.slides);
    log.info({ slides: script.slides.length }, 'Using manual slides');
  } else if (request.llmCall) {
    onProgress?.('Generating slideshow script...');
    const scriptStart = performance.now();
    script = await generateSlideshowScript({
      topic: request.topic,
      numberOfSlides: request.numberOfSlides,
      language: request.language,
      llmCall: request.llmCall,
    });
    steps.push({
      name: 'Script generation',
      durationMs: performance.now() - scriptStart,
      detail: `${script.slides.length} slides`,
    });
    log.info({ slides: script.slides.length }, 'Script generated');
  } else {
    throw new Error('Either slides[] or llmCall must be provided');
  }

  // ── 2. RENDER SLIDE IMAGES ─────────────────────────────────
  const imageDir = path.join(tmpDir, 'slides');
  fs.mkdirSync(imageDir, { recursive: true });
  const genStart = performance.now();
  const imagePaths: string[] = [];

  for (let i = 0; i < script.slides.length; i++) {
    const slide = script.slides[i]!;
    onProgress?.(`Rendering slide ${i + 1}/${script.slides.length}`);

    const slideTemplate = slide.template ?? template;
    const outPath = path.join(imageDir, `slide-${i}.png`);

    await renderToFile(
      {
        brand,
        template: slideTemplate,
        size: 'story', // 1080x1920 vertical
        title: slide.title,
        text: slide.text ?? '',
        badge: slide.badge ?? `${i + 1}`,
        num: slide.num ?? `${i + 1}`,
      },
      outPath
    );

    imagePaths.push(outPath);
  }

  steps.push({
    name: 'Image rendering',
    durationMs: performance.now() - genStart,
    detail: `${imagePaths.length} slides via image-gen`,
  });

  // ── 3. UPLOAD SLIDE IMAGES ─────────────────────────────────
  onProgress?.('Uploading slide images...');
  const storage = await createStorage();
  const imageUrls: string[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const key = `slideshow/${request.jobId ?? 'local'}/${Date.now()}-slide-${i}.png`;
    const buffer = fs.readFileSync(imagePaths[i]!);
    await storage.upload(buffer, key);
    const url = await storage.getSignedUrl(key, 7200);
    imageUrls.push(url);
  }

  // ── 4. PER-SLIDE TTS + TRANSCRIPTION ────────────────────────
  // Generate TTS audio separately for each slide, then concatenate.
  // This gives exact slide-to-audio synchronization instead of heuristic matching.

  const ttsLanguage =
    request.tts?.language ??
    (request.language === 'pl'
      ? 'pl-PL'
      : request.language === 'en'
        ? 'en-US'
        : request.language
          ? `${request.language}-${request.language.toUpperCase()}`
          : undefined);

  const ttsConfig: TTSConfig = {
    provider: request.tts?.provider ?? 'edge-tts',
    apiKey:
      request.tts?.provider === 'elevenlabs'
        ? process.env.ELEVENLABS_API_KEY
        : request.tts?.provider === 'openai'
          ? process.env.OPENAI_API_KEY
          : undefined,
    defaultLanguage: ttsLanguage ?? 'en-US',
  };
  const ttsProvider = createTTSProvider(ttsConfig);

  const WHISPER_OFFSET = 0.12; // seconds - tuned empirically with edge-tts
  const presetConfig = resolvePresetConfig(request.brandPreset);
  const whisperLang = ttsLanguage?.split('-')[0];

  const segmentBuffers: Buffer[] = [];
  const allWords: Array<{ text: string; startTime: number; endTime: number }> = [];
  const slideBoundaries: number[] = [0];
  let cumulativeDuration = 0;
  let totalTtsMs = 0;
  let totalWhisperMs = 0;
  let totalWordCount = 0;

  for (let i = 0; i < script.slides.length; i++) {
    const slide = script.slides[i]!;
    const slideText = slide.text || slide.title;
    onProgress?.(`TTS slide ${i + 1}/${script.slides.length}...`);

    // TTS for this slide
    const ttsStart = performance.now();
    const ttsResult = await ttsProvider.synthesize(slideText, {
      voice: request.tts?.voice,
      language: ttsLanguage,
    });
    totalTtsMs += performance.now() - ttsStart;

    // Get duration & normalize for whisper
    const segmentDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);
    const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);

    // Transcribe this segment
    const whisperStart = performance.now();
    const transcription = await transcribeAudio(wavBuffer, {
      apiKey: request.whisper?.apiKey,
      language: whisperLang,
      text: slideText,
      durationSeconds: segmentDuration,
    });
    totalWhisperMs += performance.now() - whisperStart;
    totalWordCount += transcription.words.length;

    // Align whisper output with original slide text
    const alignedWords = alignWordsWithScript(transcription.words, slideText);

    // Offset timestamps by cumulative duration + whisper correction
    const offsetWords = alignedWords.map((w) => ({
      text: w.text,
      startTime: w.startTime + WHISPER_OFFSET + cumulativeDuration,
      endTime: w.endTime + WHISPER_OFFSET + cumulativeDuration,
    }));

    allWords.push(...offsetWords);
    segmentBuffers.push(ttsResult.audioBuffer);
    cumulativeDuration += segmentDuration;
    slideBoundaries.push(cumulativeDuration);
  }

  steps.push({
    name: 'TTS (per-slide)',
    durationMs: totalTtsMs,
    detail: `${ttsProvider.name}, ${script.slides.length} segments`,
  });
  steps.push({
    name: 'Whisper transcription (per-slide)',
    durationMs: totalWhisperMs,
    detail: `${totalWordCount} words across ${script.slides.length} segments`,
  });

  // Concatenate MP3 buffers into one file
  const combinedBuffer = Buffer.concat(segmentBuffers);
  const voiceoverPath = path.join(tmpDir, 'voiceover.mp3');
  fs.writeFileSync(voiceoverPath, combinedBuffer);
  const totalDuration = cumulativeDuration;

  // Group combined words into cues
  // Slideshow uses larger cue groups than default (3) to avoid
  // splitting phrases like "Tap the camera icon." into two cues.
  const cues = groupWordsIntoCues(allWords, {
    maxWordsPerCue: Math.max(presetConfig.maxWordsPerCue, 6),
    maxDurationPerCue: Math.max(presetConfig.maxDurationPerCue, 4),
    breakOnPunctuation: true,
  });

  const formattedCues = cues.map((c) => ({
    id: c.id,
    text: c.text,
    startTime: c.startTime,
    endTime: c.endTime,
    words: c.words?.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
  }));

  // ── 5. UPLOAD VOICEOVER ────────────────────────────────────
  onProgress?.('Uploading voiceover...');
  const voiceoverUrl = await uploadVoiceover(voiceoverPath);

  // ── 6. ASSEMBLE COMPOSITION PROPS ──────────────────────────
  onProgress?.('Assembling composition...');
  const props = buildSlideshowProps({
    script,
    imageUrls,
    cues: formattedCues,
    slideBoundaries,
    voiceoverUrl,
    durationSeconds: totalDuration,
    musicUrl: request.musicUrl,
    musicVolume: request.musicVolume,
    highlightMode: request.highlightMode,
  });

  // ── 7. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    { ...props, compositionId: 'Slideshow' } as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress
  );
  steps.push(renderStep);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    log.warn({ tmpDir, err }, 'Cleanup failed');
  }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: totalDuration,
    script,
    steps,
  };
}
