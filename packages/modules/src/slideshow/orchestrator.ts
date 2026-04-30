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

/**
 * Allow operators to point image-gen at a custom brands directory (e.g. the
 * private `reelstack-modules/src/brands/` with techskills, fundacja CSS).
 * If unset, image-gen falls back to its packaged default (`example` only).
 */
const CUSTOM_BRANDS_DIR = process.env.REELSTACK_BRANDS_DIR || undefined;

/**
 * Allow operators to load templates from an external pack (e.g. the private
 * `reelstack-modules/src/image-gen-templates/carousel-essentials/` with
 * carousel-hook, comparison, engage-outro). image-gen searches external dirs
 * first, falls back to core templates.
 */
const CUSTOM_TEMPLATES_DIR = process.env.REELSTACK_TEMPLATES_DIR || undefined;
import {
  uploadVoiceover,
  renderVideo,
  resolvePresetConfig,
  resolveEndCard,
  buildHfEndCardBlock,
  resolveTTSDefaults,
} from '@reelstack/agent';
import type {
  ProductionStep,
  ModuleRuntime,
  BaseModuleRequest,
  PipelineDefinition,
  PipelineContext,
  EndCardConfig,
} from '@reelstack/agent';
import { compositionPath } from '@reelstack/hyperframes';
import {
  createTTSProvider,
  buildVoicePrompt,
  makeTTSFriendly,
  stripAudioTags,
} from '@reelstack/tts';
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
import { reviewSlideshowScript } from './script-reviewer';
import type { Slide, SlideshowRequest, SlideshowResult, SlideshowScript } from './types';
import type { SlideshowProps } from './remotion/schema';

const baseLog = createLogger('slideshow');

/** Default background music (served from Remotion public/ dir). */
const DEFAULT_MUSIC_PATH = 'music/bg-upbeat.mp3';
const DEFAULT_MUSIC_VOLUME = 0.13;

// ── Hyperframes variable adapter (pure, testable) ──────────

/**
 * Map a Remotion-shape SlideshowProps into the variable bag the HF
 * composition (`compositions/slideshow/index.html`) expects.
 *
 * `slides` and `cues` are base64-encoded JSON. The HF variable injector
 * HTML-escapes every value (including `"` → `&quot;`), which would break
 * inlined JS template literals. base64 is opaque to HTML escaping, so
 * the template `atob()`s + `JSON.parse()`s at runtime.
 *
 * `compositionId` points the HF renderer at the bundled template dir.
 */
/**
 * Module-level CTA fallbacks. Used by the shared `resolveEndCard()` to
 * fill in copy when the request doesn't override. Keep generic — the
 * slideshow mode covers many topics, so the default subheadline reads
 * as "more in my profile / DMs / description" rather than mode-specific.
 */
const SLIDESHOW_CTA_DEFAULTS = {
  defaultKeyword: 'INFO',
  defaultSubheadline: undefined,
} as const;

export function buildHyperframesProps(props: SlideshowProps): Record<string, unknown> {
  return {
    compositionId: compositionPath('slideshow'),
    durationSeconds: props.durationSeconds,
    backgroundColor: props.backgroundColor ?? '#000000',
    voiceoverUrl: props.voiceoverUrl ?? '',
    slidesB64: Buffer.from(JSON.stringify(props.slides), 'utf8').toString('base64'),
    cuesB64: Buffer.from(JSON.stringify(props.cues), 'utf8').toString('base64'),
    // Caption position is exposed as "% from top" (0-100). HF caption
    // container is bottom-anchored (see slideshow/index.html for why),
    // so we convert to "% from bottom" here. Default 65 (top) → 35
    // (bottom) = cross-platform safe zone above all social UI overlays.
    captionBottomPercent: 100 - (props.captionStyle?.position ?? 65),
    // End-card block. Empty string when no card is requested; otherwise
    // a self-contained HTML+JS snippet that the HF template drops into
    // its body via the `{{endCardBlock}}` placeholder.
    endCardBlock: buildHfEndCardBlock(props.endCard, props.durationSeconds),
  };
}

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
  /**
   * Caller-provided caption style overrides. Anything missing falls back
   * to the slideshow defaults (cross-platform safe zone: position 65).
   * Pass `position` here to override per-request.
   */
  captionStyle?: {
    position?: number;
    fontSize?: number;
    fontColor?: string;
    highlightColor?: string;
    backgroundColor?: string;
    backgroundOpacity?: number;
    padding?: number;
    outlineWidth?: number;
    outlineColor?: string;
    shadowBlur?: number;
  };
  /** Resolved end-card (post `resolveEndCard()`). Forwarded to props. */
  endCard?: EndCardConfig;
  /** Output aspect — drives Remotion composition dimensions. */
  aspect?: 'portrait' | 'carousel' | 'square';
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
    captionStyle: callerCaptionStyle,
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
    aspect: input.aspect ?? 'portrait',
    endCard: input.endCard,
    captionStyle: {
      fontSize: callerCaptionStyle?.fontSize ?? 60,
      fontColor: callerCaptionStyle?.fontColor ?? '#FFFFFF',
      fontWeight: 'bold' as const,
      ...(highlightMode ? { highlightMode } : {}),
      highlightColor: callerCaptionStyle?.highlightColor ?? '#FFD700',
      // 65% from top = caller-overridable cross-platform safe zone default.
      // Pass captionStyle.position in the API request to move it.
      position: callerCaptionStyle?.position ?? 65,
      backgroundColor: callerCaptionStyle?.backgroundColor ?? '#000000',
      backgroundOpacity: callerCaptionStyle?.backgroundOpacity ?? 0.65,
      padding: callerCaptionStyle?.padding ?? 18,
      outlineWidth: callerCaptionStyle?.outlineWidth ?? 3,
      outlineColor: callerCaptionStyle?.outlineColor ?? '#000000',
      shadowBlur: callerCaptionStyle?.shadowBlur ?? 8,
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
  const renderSize = request.size ?? 'story';

  for (let i = 0; i < script.slides.length; i++) {
    const slide = script.slides[i]!;
    onProgress?.(`Rendering slide ${i + 1}/${script.slides.length}`);

    const slideTemplate = slide.template ?? template;
    const outPath = path.join(imageDir, `slide-${i}.png`);

    await renderToFile(
      {
        // Spread first so template-specific params (titleHighlight, subtitle,
        // bullets, features, price, price2, heading, attr, logo, ...) reach
        // renderToFile. Explicit fields below win for required keys.
        ...slide,
        brand,
        template: slideTemplate,
        size: renderSize,
        title: slide.title,
        text: slide.text ?? '',
        badge: slide.badge ?? `${i + 1}`,
        num: slide.num ?? `${i + 1}`,
      },
      outPath,
      process.env.REELSTACK_BRANDS_DIR || undefined,
      process.env.REELSTACK_TEMPLATES_DIR || undefined
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

  // Single source of truth for provider/voice/language defaults — env-aware,
  // useCase-aware. Falls back to edge-tts when no API keys are configured.
  const ttsDefaults = resolveTTSDefaults({
    provider: request.tts?.provider,
    voice: request.tts?.voice,
    language: request.tts?.language ?? request.language,
    useCase: 'slideshow',
  });

  const ttsConfig: TTSConfig = {
    provider: ttsDefaults.provider,
    apiKey:
      ttsDefaults.provider === 'elevenlabs'
        ? process.env.ELEVENLABS_API_KEY
        : ttsDefaults.provider === 'openai'
          ? process.env.OPENAI_API_KEY
          : undefined,
    defaultLanguage: ttsDefaults.language,
  };
  const ttsProvider = createTTSProvider(ttsConfig);

  // Build a Gemini-style voicePrompt once. Other providers ignore it
  // (they read only `voice` and `language` from synthesize options).
  const isGeminiTts = ttsConfig.provider === 'gemini-tts';
  const voicePrompt = isGeminiTts
    ? buildVoicePrompt({ useCase: 'slideshow' }).voicePrompt
    : undefined;

  const WHISPER_OFFSET = 0.12; // seconds - tuned empirically with edge-tts
  const presetConfig = resolvePresetConfig(request.brandPreset);
  const whisperLang = ttsDefaults.language.split('-')[0];

  const segmentBuffers: Buffer[] = [];
  const allWords: Array<{ text: string; startTime: number; endTime: number }> = [];
  const slideBoundaries: number[] = [0];
  let cumulativeDuration = 0;
  let totalTtsMs = 0;
  let totalWhisperMs = 0;
  let totalWordCount = 0;

  for (let i = 0; i < script.slides.length; i++) {
    const slide = script.slides[i]!;
    // For Gemini: phoneticize PL acronyms + numbers, keep audio tags so
    // the model can steer delivery. For other providers: strip audio
    // tags so they don't get read as literal text ("excitedly", etc.).
    const rawText = slide.text || slide.title;
    const ttsText = isGeminiTts
      ? makeTTSFriendly(rawText, ttsDefaults.language)
      : stripAudioTags(rawText);
    // Captions ALWAYS show the clean original spelling — strip audio tags,
    // never use the phonetic conversion. alignWordsWithScript handles the
    // token-count mismatch (Whisper hears "en osiem en", we display "n8n").
    const captionText = stripAudioTags(rawText);
    onProgress?.(`TTS slide ${i + 1}/${script.slides.length}...`);

    // TTS for this slide
    const ttsStart = performance.now();
    const ttsResult = await ttsProvider.synthesize(ttsText, {
      voice: ttsDefaults.voice,
      language: ttsDefaults.language,
      voicePrompt,
    });
    totalTtsMs += performance.now() - ttsStart;

    // Get duration & normalize for whisper
    const segmentDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);
    const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);

    // Transcribe this segment — give Whisper the speech text so its
    // language model lines up with what was actually spoken.
    const whisperStart = performance.now();
    const transcription = await transcribeAudio(wavBuffer, {
      apiKey: request.whisper?.apiKey,
      language: whisperLang,
      text: ttsText,
      durationSeconds: segmentDuration,
    });
    totalWhisperMs += performance.now() - whisperStart;
    totalWordCount += transcription.words.length;

    // Align whisper output with the CAPTION text (clean original spelling).
    const alignedWords = alignWordsWithScript(transcription.words, captionText);

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
  // Resolve template-driven end-card before building props so platform-
  // only requests (`endCard: { platform: 'ig' }`) get the right copy.
  const resolvedEndCard = resolveEndCard(
    request.endCard,
    request.language ?? 'pl',
    SLIDESHOW_CTA_DEFAULTS
  );
  // Map image-gen size preset → composition aspect.
  // 'carousel' → 4:5 (1080×1350, IG feed), 'post' → 1:1, anything else → 9:16 default.
  const aspect: 'portrait' | 'carousel' | 'square' =
    request.size === 'carousel' ? 'carousel' : request.size === 'post' ? 'square' : 'portrait';
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
    captionStyle: request.captionStyle,
    endCard: resolvedEndCard,
    aspect,
  });

  // ── 7. RENDER ──────────────────────────────────────────────
  // Pick composition + runtime per request. Hyperframes wants the bundled
  // template path; Remotion wants the registered composition ID.
  const runtime: ModuleRuntime = request.runtime ?? 'remotion';
  const renderProps =
    runtime === 'hyperframes'
      ? buildHyperframesProps(props)
      : ({ ...props, compositionId: 'Slideshow' } as unknown as Record<string, unknown>);
  const { outputPath, step: renderStep } = await renderVideo(
    renderProps,
    request.outputPath,
    onProgress,
    runtime
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

// ── Multi-step pipeline (PipelineEngine-driven, resumable) ───────────────
//
// 5 steps with persisted results so /resume {fromStepId} can replay just
// the cheap downstream work. Re-render after fixing the HF composition =
// 0$ LLM, 0$ TTS, 0$ image-gen — only the render step runs again.

interface SlideshowGenerateScriptResult {
  script: SlideshowScript;
}
interface SlideshowReviewScriptResult {
  script: SlideshowScript;
  corrected: boolean;
}
interface SlideshowRenderSlidesResult {
  imageUrls: string[];
}
interface SlideshowTTSResult {
  voiceoverUrl: string;
  cues: SlideshowProps['cues'];
  slideBoundaries: number[];
  durationSeconds: number;
}
interface SlideshowAssemblePropsResult {
  props: Record<string, unknown>;
  durationSeconds: number;
}
interface SlideshowRenderResult {
  outputPath: string;
  durationSeconds: number;
}

export interface BuildSlideshowPipelineDeps {
  llmCall: (prompt: string) => Promise<string>;
}

export function buildSlideshowPipeline(
  base: BaseModuleRequest,
  _config: Record<string, unknown>,
  runtime: ModuleRuntime,
  deps: BuildSlideshowPipelineDeps
): PipelineDefinition {
  const onProgress = base.onProgress;

  return {
    id: 'slideshow',
    name: 'Slideshow (multi-step)',
    steps: [
      {
        id: 'generate-script',
        name: 'Generate slideshow script (LLM or manual)',
        dependsOn: [],
        async execute(ctx: PipelineContext): Promise<SlideshowGenerateScriptResult> {
          const topic = ctx.input.topic as string;
          const manualSlides = ctx.input.slides as Slide[] | undefined;
          if (manualSlides && manualSlides.length > 0) {
            const script = wrapManualSlides(topic, manualSlides);
            baseLog.info({ jobId: ctx.jobId, slides: script.slides.length }, 'Using manual slides');
            return { script };
          }
          onProgress?.('Generating slideshow script...');
          const script = await generateSlideshowScript({
            topic,
            numberOfSlides: ctx.input.numberOfSlides as number | undefined,
            language: ctx.input.language as string | undefined,
            llmCall: deps.llmCall,
          });
          baseLog.info({ jobId: ctx.jobId, slides: script.slides.length }, 'Script generated');
          return { script };
        },
      },
      {
        id: 'review-script',
        name: 'Lint + correct slideshow script',
        dependsOn: ['generate-script'],
        async execute(ctx: PipelineContext): Promise<SlideshowReviewScriptResult> {
          const { script } = ctx.results['generate-script'] as SlideshowGenerateScriptResult;
          // Manual slides come from a caller that already curated copy
          // (e.g. /carousel skill, where the user reviewed every line).
          // Running an LLM lint over them would silently rewrite the content,
          // breaking the contract that "video uses the same copy as the carousel".
          // skipReview lets callers opt out of the rewrite.
          const skipReview =
            (ctx.input.skipReview as boolean | undefined) === true ||
            (Array.isArray(ctx.input.slides) && (ctx.input.slides as unknown[]).length > 0);
          if (skipReview) {
            onProgress?.('Skipping script review (manual slides)...');
            return { script, corrected: false };
          }
          onProgress?.('Reviewing script...');
          const result = await reviewSlideshowScript(script, {
            llmCall: deps.llmCall,
            language: ctx.input.language as string | undefined,
          });
          return { script: result.script, corrected: result.corrected };
        },
      },
      {
        id: 'render-slides',
        name: 'Render + upload slide images',
        dependsOn: ['review-script'],
        async execute(ctx: PipelineContext): Promise<SlideshowRenderSlidesResult> {
          const { script } = ctx.results['review-script'] as SlideshowReviewScriptResult;
          const template = (ctx.input.template as string | undefined) ?? 'tip-card';
          const brand = (ctx.input.brand as string | undefined) ?? 'example';
          const renderSize = (ctx.input.size as string | undefined) ?? 'story';
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-slideshow-img-'));
          try {
            const imagePaths: string[] = [];
            for (let i = 0; i < script.slides.length; i++) {
              const slide = script.slides[i]!;
              onProgress?.(`Rendering slide ${i + 1}/${script.slides.length}`);
              const outPath = path.join(tmpDir, `slide-${i}.png`);
              await renderToFile(
                {
                  // Spread slide fields so template-specific params reach renderToFile.
                  ...slide,
                  brand,
                  template: slide.template ?? template,
                  size: renderSize,
                  title: slide.title,
                  text: slide.text ?? '',
                  badge: slide.badge ?? `${i + 1}`,
                  num: slide.num ?? `${i + 1}`,
                },
                outPath,
                process.env.REELSTACK_BRANDS_DIR || undefined,
                process.env.REELSTACK_TEMPLATES_DIR || undefined
              );
              imagePaths.push(outPath);
            }
            onProgress?.('Uploading slide images...');
            const storage = await createStorage();
            const imageUrls: string[] = [];
            for (let i = 0; i < imagePaths.length; i++) {
              const key = `slideshow/${ctx.jobId}/${Date.now()}-slide-${i}.png`;
              const buffer = fs.readFileSync(imagePaths[i]!);
              await storage.upload(buffer, key);
              imageUrls.push(await storage.getSignedUrl(key, 7200));
            }
            return { imageUrls };
          } finally {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {
              /* ignore */
            }
          }
        },
      },
      {
        id: 'tts-pipeline',
        name: 'TTS + whisper per slide + concat audio + upload',
        dependsOn: ['review-script'],
        async execute(ctx: PipelineContext): Promise<SlideshowTTSResult> {
          const { script } = ctx.results['review-script'] as SlideshowReviewScriptResult;
          const tts = ctx.input.tts as
            | {
                provider?: 'edge-tts' | 'elevenlabs' | 'openai' | 'gemini-tts';
                voice?: string;
                language?: string;
              }
            | undefined;
          const language = ctx.input.language as string | undefined;
          const ttsDefaults = resolveTTSDefaults({
            provider: tts?.provider,
            voice: tts?.voice,
            language: tts?.language ?? language,
            useCase: 'slideshow',
          });
          const ttsConfig: TTSConfig = {
            provider: ttsDefaults.provider,
            apiKey:
              ttsDefaults.provider === 'elevenlabs'
                ? process.env.ELEVENLABS_API_KEY
                : ttsDefaults.provider === 'openai'
                  ? process.env.OPENAI_API_KEY
                  : undefined,
            defaultLanguage: ttsDefaults.language,
          };
          const ttsProvider = createTTSProvider(ttsConfig);
          const isGeminiTts = ttsConfig.provider === 'gemini-tts';
          const voicePrompt = isGeminiTts
            ? buildVoicePrompt({ useCase: 'slideshow' }).voicePrompt
            : undefined;
          const WHISPER_OFFSET = 0.12;
          const presetConfig = resolvePresetConfig(
            ctx.input.brandPreset as Parameters<typeof resolvePresetConfig>[0]
          );
          const whisperLang = ttsDefaults.language.split('-')[0];

          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-slideshow-tts-'));
          try {
            const segmentBuffers: Buffer[] = [];
            const allWords: Array<{ text: string; startTime: number; endTime: number }> = [];
            const slideBoundaries: number[] = [0];
            let cumulativeDuration = 0;

            for (let i = 0; i < script.slides.length; i++) {
              const slide = script.slides[i]!;
              const rawText = slide.text || slide.title;
              const ttsText = isGeminiTts
                ? makeTTSFriendly(rawText, ttsDefaults.language)
                : stripAudioTags(rawText);
              // Captions show clean original (no audio tags, no phonetic).
              const captionText = stripAudioTags(rawText);
              onProgress?.(`TTS slide ${i + 1}/${script.slides.length}...`);
              const ttsResult = await ttsProvider.synthesize(ttsText, {
                voice: ttsDefaults.voice,
                language: ttsDefaults.language,
                voicePrompt,
              });
              const segmentDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);
              const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);
              const transcription = await transcribeAudio(wavBuffer, {
                apiKey: (ctx.input.whisper as { apiKey?: string } | undefined)?.apiKey,
                language: whisperLang,
                text: ttsText,
                durationSeconds: segmentDuration,
              });
              const aligned = alignWordsWithScript(transcription.words, captionText);
              const offsetWords = aligned.map((w) => ({
                text: w.text,
                startTime: w.startTime + WHISPER_OFFSET + cumulativeDuration,
                endTime: w.endTime + WHISPER_OFFSET + cumulativeDuration,
              }));
              allWords.push(...offsetWords);
              segmentBuffers.push(ttsResult.audioBuffer);
              cumulativeDuration += segmentDuration;
              slideBoundaries.push(cumulativeDuration);
            }

            const combinedBuffer = Buffer.concat(segmentBuffers);
            const voiceoverPath = path.join(tmpDir, 'voiceover.mp3');
            fs.writeFileSync(voiceoverPath, combinedBuffer);

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
              words: c.words?.map((w) => ({
                text: w.text,
                startTime: w.startTime,
                endTime: w.endTime,
              })),
            }));

            onProgress?.('Uploading voiceover...');
            const voiceoverUrl = await uploadVoiceover(voiceoverPath);

            return {
              voiceoverUrl,
              cues: formattedCues,
              slideBoundaries,
              durationSeconds: cumulativeDuration,
            };
          } finally {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {
              /* ignore */
            }
          }
        },
      },
      {
        id: 'assemble-props',
        name: 'Assemble Remotion / Hyperframes props',
        dependsOn: ['review-script', 'render-slides', 'tts-pipeline'],
        async execute(ctx: PipelineContext): Promise<SlideshowAssemblePropsResult> {
          onProgress?.('Assembling composition...');
          const { script } = ctx.results['review-script'] as SlideshowReviewScriptResult;
          const { imageUrls } = ctx.results['render-slides'] as SlideshowRenderSlidesResult;
          const { voiceoverUrl, cues, slideBoundaries, durationSeconds } = ctx.results[
            'tts-pipeline'
          ] as SlideshowTTSResult;

          const ctxLang = (ctx.input.language as string | undefined) ?? 'pl';
          const ctxEndCard = resolveEndCard(
            ctx.input.endCard as EndCardConfig | undefined,
            ctxLang,
            SLIDESHOW_CTA_DEFAULTS
          );
          const ctxSize = ctx.input.size as string | undefined;
          const ctxAspect: 'portrait' | 'carousel' | 'square' =
            ctxSize === 'carousel' ? 'carousel' : ctxSize === 'post' ? 'square' : 'portrait';
          const remotionProps = buildSlideshowProps({
            script,
            imageUrls,
            cues,
            slideBoundaries,
            voiceoverUrl,
            durationSeconds,
            musicUrl: ctx.input.musicUrl as string | undefined,
            musicVolume: ctx.input.musicVolume as number | undefined,
            highlightMode: ctx.input.highlightMode as string | undefined,
            captionStyle: ctx.input.captionStyle as SlideshowRequest['captionStyle'] | undefined,
            endCard: ctxEndCard,
            aspect: ctxAspect,
          });

          const props =
            runtime === 'hyperframes'
              ? buildHyperframesProps(remotionProps)
              : ({ ...remotionProps, compositionId: 'Slideshow' } as unknown as Record<
                  string,
                  unknown
                >);

          return { props, durationSeconds };
        },
      },
      {
        id: 'render',
        name: `Render via ${runtime}`,
        dependsOn: ['assemble-props'],
        async execute(ctx: PipelineContext): Promise<SlideshowRenderResult> {
          onProgress?.('Rendering video...');
          const { props, durationSeconds } = ctx.results[
            'assemble-props'
          ] as SlideshowAssemblePropsResult;
          const outputPathOverride = ctx.input.outputPath as string | undefined;
          const { outputPath } = await renderVideo(props, outputPathOverride, onProgress, runtime);
          return { outputPath, durationSeconds };
        },
      },
    ],
  };
}
