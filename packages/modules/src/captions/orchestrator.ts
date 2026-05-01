/**
 * Captions orchestrator.
 *
 * Pipeline:
 * a. If cues provided AND no script: use cues directly, determine duration from max cue endTime.
 * b. If script provided: run TTS pipeline (runTTSPipeline from @reelstack/agent) -> get cues + voiceover.
 * c. Build VideoClipProps: single clip from videoUrl, cues, optional voiceoverUrl, highlightMode, captionStyle.
 * d. Render with compositionId: 'VideoClip'.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runTTSPipeline,
  renderVideo,
  uploadVoiceover,
  resolveEndCard,
  buildHfEndCardBlock,
  buildHfCaptionPresetVars,
} from '@reelstack/agent';
import type { BrandPreset, ProgressCallback, ModuleRuntime, EndCardConfig } from '@reelstack/agent';
import { endCardConfigToSelection } from '@reelstack/remotion/components/end-card-config-adapter';
import { createLogger } from '@reelstack/logger';
import { compositionPath } from '@reelstack/hyperframes';
import type { VideoClipProps } from '@reelstack/remotion/schemas/video-clip-props';

const log = createLogger('captions-orchestrator');

// ── Types ──────────────────────────────────────────────────────

export interface CaptionCue {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: Array<{ text: string; startTime: number; endTime: number }>;
}

export interface BuildCaptionsPropsInput {
  videoUrl: string;
  cues: CaptionCue[];
  durationSeconds?: number;
  voiceoverUrl?: string;
  highlightMode?: string;
  captionStyle?: {
    fontSize?: number;
    fontColor?: string;
    highlightColor?: string;
    position?: number;
  };
}

export interface CaptionsRequest {
  jobId?: string;
  videoUrl: string;
  /** Pre-computed cues — use directly (no TTS) */
  cues?: CaptionCue[];
  /** Script text — runs TTS pipeline to generate cues + voiceover */
  script?: string;
  highlightMode?: string;
  captionStyle?: BuildCaptionsPropsInput['captionStyle'];
  language?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai' | 'gemini-tts';
    voice?: string;
    language?: string;
  };
  whisper?: {
    provider?: 'openai' | 'cloudflare' | 'whisper-cpp' | 'synthetic';
    apiKey?: string;
  };
  brandPreset?: BrandPreset;
  outputPath?: string;
  onProgress?: ProgressCallback;
  /** Render runtime (default: 'remotion'). */
  runtime?: ModuleRuntime;
  /**
   * Closing CTA card. Per-platform template via `endCard.platform`.
   * Module fallback uses `defaultKeyword: 'INFO'`.
   */
  endCard?: EndCardConfig;
}

const CAPTIONS_CTA_DEFAULTS = {
  defaultKeyword: 'INFO',
  defaultSubheadline: undefined,
} as const;

export interface CaptionsResult {
  outputPath: string;
  durationSeconds: number;
}

// ── Hyperframes variable adapter (pure, testable) ──────────────

/**
 * Map a Remotion-shape VideoClipProps into the variable bag the HF
 * captions composition expects. The HF template renders the source
 * video, optional voiceover audio, and a karaoke caption layer driven
 * by `cuesJson`. The first clip drives the layout — extra clips are
 * not rendered (HF captions composition is single-clip; concat happens
 * server-side if needed).
 */
export function buildCaptionsHyperframesProps(
  props: VideoClipProps,
  durationSeconds: number,
  endCard?: EndCardConfig
): Record<string, unknown> {
  const firstClip = props.clips[0];
  const captionStyle = props.captionStyle;
  const fontSize = captionStyle?.fontSize ?? 56;
  const fontColor = captionStyle?.fontColor ?? '#FFFFFF';
  const highlightColor = captionStyle?.highlightColor ?? '#FFD700';
  const upcomingColor = captionStyle?.upcomingColor;

  // Resolve preset block (CSS + optional GSAP tweens) for the requested
  // highlightMode. Defaults to `text` when no mode is set or the slug
  // is unknown — the dispatcher never breaks the render.
  const presetVars = buildHfCaptionPresetVars(props.highlightMode, {
    fontSize,
    fontColor,
    highlightColor,
    upcomingColor,
  });

  return {
    compositionId: compositionPath('captions'),
    durationSeconds,
    backgroundColor: props.backgroundColor ?? '#000000',
    videoUrl: firstClip?.url ?? '',
    // The captions composition has its own audio track when a voiceover URL
    // is supplied — the source video would otherwise double-up on sound. We
    // mute the <video> when voiceoverUrl is present.
    videoMuted: props.voiceoverUrl ? 'muted' : '',
    voiceoverUrl: props.voiceoverUrl ?? '',
    cuesB64: Buffer.from(JSON.stringify(props.cues ?? []), 'utf8').toString('base64'),
    fontSize,
    fontColor,
    highlightColor,
    // 65% from top = caption baseline in the cross-platform safe zone
    // (above YouTube Shorts' ~18% bottom-UI overlay, TikTok's ~14% music
    // bar, IG Reels' ~13% description). 78 was inside the YT chrome.
    captionTopPercent: captionStyle?.position ?? 65,
    captionPresetCss: presetVars.presetCss,
    captionPresetTimelineJs: presetVars.presetTimelineJs,
    endCardBlock: buildHfEndCardBlock(endCard, durationSeconds, 'captions'),
  };
}

// ── Pure props builder (exported for testability) ──────────────

export function buildCaptionsProps(input: BuildCaptionsPropsInput): VideoClipProps {
  const { videoUrl, cues, voiceoverUrl, highlightMode, captionStyle } = input;

  // Determine duration: explicit > max cue endTime > fallback
  const durationFromCues = cues.length > 0 ? Math.max(...cues.map((c) => c.endTime)) : 30;
  const durationSeconds = input.durationSeconds ?? durationFromCues;

  return {
    clips: [
      {
        url: videoUrl,
        startTime: 0,
        endTime: durationSeconds,
        transition: 'none' as const,
        transitionDurationMs: 0,
      },
    ],
    cues,
    voiceoverUrl,
    durationSeconds,
    backgroundColor: '#000000',
    musicVolume: 0,
    highlightMode,
    captionStyle: {
      fontSize: captionStyle?.fontSize ?? 64,
      fontColor: captionStyle?.fontColor ?? '#FFFFFF',
      highlightColor: captionStyle?.highlightColor ?? '#FFD700',
      // See `captionTopPercent` comment above — 65 keeps captions out
      // of every social UI overlay zone simultaneously.
      position: captionStyle?.position ?? 65,
    },
  };
}

// ── Full pipeline ───────────────────────────────────────────────

export async function produceCaptions(request: CaptionsRequest): Promise<CaptionsResult> {
  const logger = request.jobId ? log.child({ jobId: request.jobId }) : log;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-captions-'));

  let cues: CaptionCue[];
  let voiceoverUrl: string | undefined;
  let durationSeconds: number | undefined;

  if (request.cues && !request.script) {
    // Path a: use pre-computed cues directly
    logger.info({ cues: request.cues.length }, 'Using provided cues directly');
    cues = request.cues;
    durationSeconds = Math.max(...cues.map((c) => c.endTime));
  } else if (!request.script) {
    // Path b: transcribe video's own audio → captions (no TTS, keep original audio)
    request.onProgress?.('Extracting audio from video...');
    logger.info('Extracting audio for transcription');

    const { execFileSync } = await import('child_process');
    const audioPath = path.join(tmpDir, 'extracted-audio.wav');

    // Download video if it's a URL
    let videoLocalPath: string;
    if (request.videoUrl.startsWith('http')) {
      videoLocalPath = path.join(tmpDir, 'source-video.mp4');
      const res = await fetch(request.videoUrl, {
        signal: AbortSignal.timeout(120_000),
        redirect: 'error',
      });
      if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
      fs.writeFileSync(videoLocalPath, Buffer.from(await res.arrayBuffer()));
    } else {
      videoLocalPath = request.videoUrl;
    }

    // Extract audio
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        videoLocalPath,
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        '16000',
        '-ac',
        '1',
        audioPath,
      ],
      { stdio: 'pipe', timeout: 60_000 }
    );

    // Get duration
    const audioBuffer = fs.readFileSync(audioPath);
    const { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } =
      await import('@reelstack/remotion/pipeline');
    const { groupWordsIntoCues, alignWordsWithScript } = await import('@reelstack/transcription');
    const { resolvePresetConfig } = await import('@reelstack/agent');

    durationSeconds = getAudioDuration(audioBuffer, 'wav');
    logger.info({ durationSeconds }, 'Audio extracted');

    // Whisper transcribe
    request.onProgress?.('Transcribing audio...');
    const wavBuffer = normalizeAudioForWhisper(audioBuffer, 'wav');
    const transcription = await transcribeAudio(wavBuffer, {
      apiKey: request.whisper?.apiKey,
      language: request.language?.split('-')[0],
      durationSeconds,
    });
    logger.info({ words: transcription.words.length }, 'Transcription complete');

    // Offset + group into cues
    const WHISPER_OFFSET = 0.12;
    const offsetWords = transcription.words.map((w) => ({
      ...w,
      startTime: w.startTime + WHISPER_OFFSET,
      endTime: w.endTime + WHISPER_OFFSET,
    }));

    const presetConfig = resolvePresetConfig(request.brandPreset);
    cues = groupWordsIntoCues(offsetWords, {
      maxWordsPerCue:
        request.highlightMode === 'single-word' ? 1 : (presetConfig.maxWordsPerCue ?? 6),
      maxDurationPerCue: presetConfig.maxDurationPerCue ?? 3,
      breakOnPunctuation: true,
    }) as CaptionCue[];

    // No voiceoverUrl — keep video's original audio
    voiceoverUrl = undefined;
  } else {
    // Path c: run TTS pipeline (generates new voiceover, replaces original audio)
    request.onProgress?.('Generating voiceover...');
    logger.info('Running TTS pipeline');

    const ttsResult = await runTTSPipeline(
      {
        script: request.script!,
        tts: request.tts,
        whisper: request.whisper,
        brandPreset: request.brandPreset,
      },
      tmpDir,
      request.onProgress
    );

    cues = ttsResult.cues;
    durationSeconds = ttsResult.audioDuration;

    // Upload voiceover
    request.onProgress?.('Uploading voiceover...');
    voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);
    logger.info({ durationSeconds }, 'TTS pipeline complete');
  }

  // Build composition props
  request.onProgress?.('Assembling composition...');
  const resolvedEndCard = resolveEndCard(
    request.endCard,
    request.language ?? 'pl',
    CAPTIONS_CTA_DEFAULTS
  );
  const props = buildCaptionsProps({
    videoUrl: request.videoUrl,
    cues,
    durationSeconds,
    voiceoverUrl,
    highlightMode: request.highlightMode,
    captionStyle: request.captionStyle,
  });
  // Inject endCard into Remotion props for the VideoClip composition path.
  (props as VideoClipProps & { endCard?: ReturnType<typeof endCardConfigToSelection> }).endCard =
    endCardConfigToSelection(resolvedEndCard);

  // Render — pick runtime per request.
  const runtime: ModuleRuntime = request.runtime ?? 'remotion';
  const renderProps =
    runtime === 'hyperframes'
      ? buildCaptionsHyperframesProps(props, durationSeconds, resolvedEndCard)
      : ({ ...props, compositionId: 'VideoClip' } as unknown as Record<string, unknown>);
  const { outputPath } = await renderVideo(
    renderProps,
    request.outputPath,
    request.onProgress,
    runtime
  );

  logger.info({ outputPath, durationSeconds }, 'Captions render complete');

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  return { outputPath, durationSeconds };
}
