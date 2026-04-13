import { randomUUID } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTTSProvider } from '@reelstack/tts';
import type { TTSConfig } from '@reelstack/tts';
import { groupWordsIntoCues } from '@reelstack/transcription';
import type { ReelCreationRequest, ReelCreationResult, PipelineStep } from './types';
import type { ReelProps } from '../schemas/reel-props';
import { effectSegmentSchema } from '../effects/schemas';
import { normalizeAudioForWhisper, getAudioDuration } from './audio-utils';
import { transcribeAudio } from './transcribe';
import { direct } from '../director';
import { createRenderer } from '../render';

function getRemotionPkgDir(): string {
  const dir = import.meta.dirname ?? __dirname;
  if (!dir)
    throw new Error(
      'Cannot resolve remotion package directory (no __dirname or import.meta.dirname)'
    );
  return path.resolve(dir, '../..');
}

/**
 * Creates a reel from a text script:
 * Script → TTS → Whisper → Cues → AI Director → ReelProps → Remotion render → MP4
 */
export async function createReel(
  request: ReelCreationRequest,
  onStep?: (step: string) => void
): Promise<ReelCreationResult> {
  const steps: PipelineStep[] = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-pipeline-'));
  let voiceoverPublicPath: string | undefined;
  let bundleVoiceoverPath: string | undefined;

  try {
    // ── Step 1: TTS ─────────────────────────────────────────
    onStep?.('Generating voiceover...');
    const ttsStart = performance.now();

    const ttsConfig: TTSConfig = {
      provider: request.tts?.provider ?? 'edge-tts',
      apiKey:
        request.tts?.provider === 'elevenlabs'
          ? process.env.ELEVENLABS_API_KEY
          : request.tts?.provider === 'openai'
            ? process.env.OPENAI_API_KEY
            : undefined,
      defaultLanguage: request.tts?.language ?? 'pl-PL',
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

    // ── Step 2: Normalize audio for Whisper ─────────────────
    onStep?.('Normalizing audio...');
    const normStart = performance.now();

    const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);
    const audioDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);

    steps.push({
      name: 'Audio normalization',
      durationMs: performance.now() - normStart,
      detail: `${audioDuration.toFixed(1)}s, 16kHz mono WAV`,
    });

    // ── Step 3: Whisper transcription ───────────────────────
    onStep?.('Transcribing audio...');
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

    // ── Step 4: Group words into cues ───────────────────────
    onStep?.('Grouping into subtitle cues...');
    const groupStart = performance.now();

    const cues = groupWordsIntoCues(transcription.words, {
      maxWordsPerCue: 6,
      maxDurationPerCue: 3,
      breakOnPunctuation: true,
    });

    steps.push({
      name: 'Word grouping',
      durationMs: performance.now() - groupStart,
      detail: `${cues.length} cues from ${transcription.words.length} words`,
    });

    // ── Step 5: AI Director ───────────────────────────────────
    onStep?.('AI Director analyzing content...');
    const directorStart = performance.now();

    const directorOutput = await direct({
      cues,
      text: transcription.text,
      durationSeconds: audioDuration,
      brandPreset: request.brandPreset
        ? {
            captionTemplate: request.brandPreset.captionTemplate,
            highlightColor: request.brandPreset.highlightColor,
            backgroundColor: request.brandPreset.backgroundColor,
            defaultTransition: request.brandPreset.defaultTransition,
          }
        : undefined,
      style: request.style,
    });

    steps.push({
      name: 'AI Director',
      durationMs: performance.now() - directorStart,
      detail: `${directorOutput.bRollSegments.length} B-roll segments, ${directorOutput.editNotes.length} notes`,
    });

    // ── Step 6: Build ReelProps ──────────────────────────────
    onStep?.('Building composition...');

    // Copy voiceover to public/ so Remotion can access it via staticFile()
    const voiceoverFilename = `voiceover-${randomUUID()}.mp3`;
    voiceoverPublicPath = path.join(getRemotionPkgDir(), 'public', voiceoverFilename);
    fs.copyFileSync(voiceoverPath, voiceoverPublicPath);

    // Also copy to the cached bundle dir (if it already exists), because
    // Remotion serves staticFile() from the bundle root, not the source public/.
    const bundleDir = process.env.REMOTION_BUNDLE_PATH ?? path.join(os.tmpdir(), 'remotion-bundle');
    bundleVoiceoverPath = path.join(bundleDir, voiceoverFilename);
    if (fs.existsSync(bundleDir)) {
      fs.copyFileSync(voiceoverPath, bundleVoiceoverPath);
    }

    const props: ReelProps = {
      layout: request.layout,
      primaryVideoUrl: request.primaryVideoUrl,
      primaryVideoObjectPosition: 'center',
      primaryVideoTransparent: false,
      secondaryVideoUrl: request.secondaryVideoUrl,
      voiceoverUrl: voiceoverFilename,
      pipSegments: [],
      lowerThirds: [],
      ctaSegments: [],
      counters: [],
      zoomSegments: [],
      highlights: [],
      effects: (directorOutput.effects ?? []).flatMap((e) => {
        const raw = { type: e.type, startTime: e.startTime, endTime: e.endTime, ...e.config };
        const parsed = effectSegmentSchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      }),
      dynamicCaptionPosition: false,
      bRollSegments: directorOutput.bRollSegments.map((seg) => {
        const transition = seg.transition
          ? {
              type: seg.transition.type as
                | 'crossfade'
                | 'slide-left'
                | 'slide-right'
                | 'zoom-in'
                | 'wipe'
                | 'none',
              durationMs: seg.transition.durationMs ?? 300,
            }
          : undefined;
        return {
          startTime: seg.startTime,
          endTime: seg.endTime,
          media: seg.media,
          animation: seg.animation,
          transition,
        };
      }),
      cues: cues.map((c) => ({
        id: c.id,
        text: c.text,
        startTime: c.startTime,
        endTime: c.endTime,
        words: c.words?.map((w) => ({
          text: w.text,
          startTime: w.startTime,
          endTime: w.endTime,
        })),
      })),
      captionStyle: {
        fontFamily: request.brandPreset?.captionTemplate?.fontFamily ?? 'Outfit, sans-serif',
        fontSize: request.brandPreset?.captionTemplate?.fontSize ?? 64,
        fontColor: request.brandPreset?.captionTemplate?.fontColor ?? '#F5F5F0',
        fontWeight: 'bold',
        fontStyle: 'normal',
        backgroundColor: request.brandPreset?.captionTemplate?.backgroundColor ?? '#0E0E12',
        backgroundOpacity: 0.85,
        outlineColor: '#0E0E12',
        outlineWidth: 3,
        shadowColor: '#000000',
        shadowBlur: 12,
        position: 75,
        alignment: 'center',
        lineHeight: 1.3,
        padding: 16,
        highlightColor: request.brandPreset?.highlightColor ?? '#F59E0B',
        upcomingColor: request.brandPreset?.captionTemplate?.fontColor ?? '#8888A0',
        highlightMode: 'text' as const,
        textTransform: 'none' as const,
      },
      musicVolume: 0,
      showProgressBar: true,
      backgroundColor: request.brandPreset?.backgroundColor ?? '#000000',
      speedRamps: [],
    };

    // ── Step 7: Remotion render ─────────────────────────────
    onStep?.('Rendering video...');
    const renderStart = performance.now();

    const outputPath = request.outputPath ?? path.join(os.tmpdir(), 'remotion-out', 'reel.mp4');
    const renderer = createRenderer();
    const renderResult = await renderer.render(props, { outputPath });

    steps.push({
      name: 'Remotion render',
      durationMs: renderResult.durationMs,
      detail: `${outputPath} (${(renderResult.sizeBytes / 1024).toFixed(0)} KB)`,
    });

    const stats = fs.statSync(outputPath);
    const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);

    onStep?.(`Done! ${(stats.size / 1024).toFixed(0)} KB in ${(totalMs / 1000).toFixed(1)}s`);

    return {
      outputPath,
      durationSeconds: audioDuration,
      props,
      steps,
    };
  } finally {
    if (voiceoverPublicPath && fs.existsSync(voiceoverPublicPath)) {
      fs.unlinkSync(voiceoverPublicPath);
    }
    if (bundleVoiceoverPath && fs.existsSync(bundleVoiceoverPath)) {
      fs.unlinkSync(bundleVoiceoverPath);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
