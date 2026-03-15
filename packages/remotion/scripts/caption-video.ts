#!/usr/bin/env npx tsx
/**
 * CLI: Existing video → extract audio → Whisper → captions overlay → MP4
 *
 * Usage:
 *   npx tsx scripts/caption-video.ts --input video.mp4
 *   npx tsx scripts/caption-video.ts --input video.mp4 --brand brands/techskills.json
 *   npx tsx scripts/caption-video.ts --input video.mp4 --lang en-US --output out/captioned.mp4
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { groupWordsIntoCues } from '@reelstack/transcription';
import type { ReelProps } from '../src/schemas/reel-props';
import { transcribeAudio } from '../src/pipeline/transcribe';
import { direct } from '../src/director';
import { createRenderer } from '../src/render';

const REMOTION_PKG_DIR = path.resolve(import.meta.dirname, '..');

interface PipelineStep {
  name: string;
  durationMs: number;
  detail?: string;
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      result[arg.slice(2)] = args[++i];
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputVideo = args['input'];
  if (!inputVideo || !fs.existsSync(inputVideo)) {
    console.error('Usage: npx tsx scripts/caption-video.ts --input <video.mp4> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --input path        Input video file (required)');
    console.error('  --lang code         Language code (default: pl-PL)');
    console.error('  --brand path        Brand preset JSON file');
    console.error('  --output path       Output MP4 path');
    console.error('  --layout type       fullscreen | split-screen (default: fullscreen)');
    console.error('  --style type        dynamic | calm | cinematic (default: dynamic)');
    console.error(
      '  --captions-only     Skip AI Director, render captions only (no B-roll/effects)'
    );
    console.error(
      '  --highlight mode    Highlight mode: text | pill | single-word | hormozi | glow'
    );
    process.exit(1);
  }

  // Load brand preset
  let brandPreset: any;
  if (args['brand']) {
    try {
      brandPreset = JSON.parse(fs.readFileSync(args['brand'], 'utf-8'));
    } catch {
      console.error(`Failed to parse JSON from brand file: ${args['brand']}`);
      process.exit(1);
    }
  }

  // Load color preset
  let colorPreset: any;
  if (args['preset']) {
    const presetsPath = path.join(REMOTION_PKG_DIR, 'brands', 'caption-presets.json');
    let presets: any;
    try {
      presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
    } catch {
      console.error(`Failed to parse JSON from presets file: ${presetsPath}`);
      process.exit(1);
    }
    colorPreset = presets[args['preset']];
    if (!colorPreset) {
      console.error(
        `Unknown preset "${args['preset']}". Available: ${Object.keys(presets).join(', ')}`
      );
      process.exit(1);
    }
  }

  const lang = args['lang'] ?? 'pl-PL';
  const layout = (args['layout'] ?? 'fullscreen') as ReelProps['layout'];
  const style = (args['style'] ?? 'dynamic') as 'dynamic' | 'calm' | 'cinematic' | 'educational';
  const captionsOnly = 'captions-only' in args;

  // Get video info
  const probeJson = execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${inputVideo}"`,
    { encoding: 'utf-8' }
  );
  let probe: any;
  try {
    probe = JSON.parse(probeJson);
  } catch {
    console.error('Failed to parse JSON from ffprobe output');
    process.exit(1);
  }
  const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
  const videoDuration = parseFloat(probe.format.duration);
  const videoSize = parseInt(probe.format.size, 10);

  console.log('ReelStack Caption Pipeline');
  console.log('─'.repeat(50));
  console.log(
    `Input:    ${path.basename(inputVideo)} (${(videoSize / 1024 / 1024).toFixed(1)} MB)`
  );
  console.log(
    `Video:    ${videoStream?.width}x${videoStream?.height}, ${videoDuration.toFixed(1)}s`
  );
  console.log(`Language: ${lang}`);
  console.log(`Whisper:  ${process.env.OPENAI_API_KEY ? 'OpenAI API' : 'whisper.cpp local'}`);
  console.log(`AI Director: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'rule-based'}`);
  console.log('─'.repeat(50));

  const steps: PipelineStep[] = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-caption-'));

  try {
    // ── Step 1: Extract audio ───────────────────────────────
    console.log('  → Extracting audio...');
    const extractStart = performance.now();

    const wavPath = path.join(tmpDir, 'audio.wav');
    execSync(`ffmpeg -y -i "${inputVideo}" -ar 16000 -ac 1 -f wav "${wavPath}"`, { stdio: 'pipe' });
    const wavBuffer = fs.readFileSync(wavPath);

    steps.push({
      name: 'Audio extraction',
      durationMs: performance.now() - extractStart,
      detail: `${videoDuration.toFixed(1)}s, 16kHz mono WAV`,
    });

    // ── Step 2: Whisper transcription ───────────────────────
    console.log('  → Transcribing audio...');
    const whisperStart = performance.now();

    const transcription = await transcribeAudio(wavBuffer, {
      language: lang.split('-')[0],
    });

    steps.push({
      name: 'Whisper transcription',
      durationMs: performance.now() - whisperStart,
      detail: `${transcription.words.length} words`,
    });

    // ── Step 3: Group words into cues ───────────────────────
    console.log('  → Grouping into subtitle cues...');
    const groupStart = performance.now();

    const cues = groupWordsIntoCues(
      transcription.words,
      {
        maxWordsPerCue: 6,
        maxDurationPerCue: 3,
        breakOnPunctuation: true,
      },
      'karaoke'
    );

    steps.push({
      name: 'Word grouping',
      durationMs: performance.now() - groupStart,
      detail: `${cues.length} cues from ${transcription.words.length} words`,
    });

    // ── Step 4: AI Director (skipped with --captions-only) ──
    let directorOutput: { bRollSegments: any[] } = { bRollSegments: [] };
    if (!captionsOnly) {
      console.log('  → AI Director analyzing content...');
      const directorStart = performance.now();

      directorOutput = await direct({
        cues,
        text: transcription.text,
        durationSeconds: videoDuration,
        brandPreset: brandPreset
          ? {
              captionTemplate: brandPreset.captionTemplate,
              highlightColor: brandPreset.highlightColor,
              backgroundColor: brandPreset.backgroundColor,
              defaultTransition: brandPreset.defaultTransition,
            }
          : undefined,
        style,
      });

      steps.push({
        name: 'AI Director',
        durationMs: performance.now() - directorStart,
        detail: `${directorOutput.bRollSegments.length} B-roll segments`,
      });
    } else {
      console.log('  → Captions only (AI Director skipped)');
    }

    // ── Step 5: Copy video + extract audio to public/ ────────
    console.log('  → Preparing composition...');

    const videoPublicPath = path.join(REMOTION_PKG_DIR, 'public', 'input-video.mp4');
    const audioPublicPath = path.join(REMOTION_PKG_DIR, 'public', 'input-audio.mp3');
    fs.copyFileSync(inputVideo, videoPublicPath);
    execSync(`ffmpeg -y -i "${inputVideo}" -vn -acodec libmp3lame -q:a 2 "${audioPublicPath}"`, {
      stdio: 'pipe',
    });

    const captionStyle = {
      fontFamily:
        colorPreset?.fontFamily ?? brandPreset?.captionTemplate?.fontFamily ?? 'Outfit, sans-serif',
      fontSize: brandPreset?.captionTemplate?.fontSize ?? 64,
      fontColor: colorPreset?.fontColor ?? brandPreset?.captionTemplate?.fontColor ?? '#F5F5F0',
      fontWeight: 'bold' as const,
      fontStyle: 'normal' as const,
      backgroundColor:
        colorPreset?.backgroundColor ?? brandPreset?.captionTemplate?.backgroundColor ?? '#0E0E12',
      backgroundOpacity: colorPreset?.backgroundOpacity ?? 0.85,
      outlineColor: colorPreset?.outlineColor ?? '#0E0E12',
      outlineWidth: colorPreset?.outlineWidth ?? 3,
      shadowColor: colorPreset?.shadowColor ?? '#000000',
      shadowBlur: colorPreset?.shadowBlur ?? 12,
      position: 67,
      alignment: 'center' as const,
      lineHeight: 1.3,
      padding: 16,
      highlightColor: colorPreset?.highlightColor ?? brandPreset?.highlightColor ?? '#F59E0B',
      upcomingColor: colorPreset?.upcomingColor ?? '#8888A0',
      highlightMode: (args['highlight'] as any) ?? colorPreset?.highlightMode ?? 'text',
      textTransform: (args['uppercase'] === 'true'
        ? 'uppercase'
        : (colorPreset?.textTransform ?? 'none')) as any,
      pillColor: colorPreset?.pillColor ?? '#F59E0B',
      pillBorderRadius: colorPreset?.pillBorderRadius ?? 10,
      pillPadding: colorPreset?.pillPadding ?? 12,
    };

    const props: ReelProps = {
      layout,
      primaryVideoUrl: 'input-video.mp4',
      voiceoverUrl: 'input-audio.mp3',
      bRollSegments: directorOutput.bRollSegments.map((seg) => ({
        startTime: seg.startTime,
        endTime: seg.endTime,
        media: seg.media,
        animation: seg.animation,
        transition: seg.transition
          ? {
              type: seg.transition.type as any,
              durationMs: seg.transition.durationMs ?? 300,
            }
          : undefined,
      })),
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
        animationStyle: c.animationStyle,
      })),
      captionStyle,
      effects: [],
      musicVolume: 0,
      showProgressBar: false,
      backgroundColor: brandPreset?.backgroundColor ?? '#000000',
    };

    // ── Step 6: Remotion render ─────────────────────────────
    console.log('  → Rendering video...');
    const renderStart = performance.now();

    const outputPath = args['output'] ?? path.join(REMOTION_PKG_DIR, 'out', 'captioned.mp4');
    const renderer = createRenderer();
    const renderResult = await renderer.render(props, { outputPath });

    steps.push({
      name: 'Remotion render',
      durationMs: renderResult.durationMs,
      detail: `${outputPath} (${(renderResult.sizeBytes / 1024).toFixed(0)} KB)`,
    });

    // ── Cleanup ─────────────────────────────────────────────
    if (fs.existsSync(videoPublicPath)) fs.unlinkSync(videoPublicPath);
    if (fs.existsSync(audioPublicPath)) fs.unlinkSync(audioPublicPath);

    const fileSize = fs.statSync(outputPath).size;
    const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);

    console.log(`  → Done! ${(fileSize / 1024).toFixed(0)} KB in ${(totalMs / 1000).toFixed(1)}s`);
    console.log('');
    console.log('Pipeline steps:');
    for (const step of steps) {
      console.log(
        `  ${step.name.padEnd(22)} ${(step.durationMs / 1000).toFixed(1)}s  ${step.detail ?? ''}`
      );
    }

    console.log('');
    console.log('Transcription:');
    console.log(
      `  "${transcription.text.slice(0, 120)}${transcription.text.length > 120 ? '...' : ''}"`
    );
    console.log('');
    console.log(`Output: ${outputPath}`);
    console.log(`Size:   ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Duration: ${videoDuration.toFixed(1)}s`);
    console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message ?? err);
  process.exit(1);
});
