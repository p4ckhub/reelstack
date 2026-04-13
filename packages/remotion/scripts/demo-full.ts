#!/usr/bin/env npx tsx
/**
 * Full demo: showcases ALL pipeline capabilities with a real video input.
 *
 * - Split-screen layout (talking head + screen recording placeholder)
 * - B-roll cutaways with various transitions (crossfade, slide, zoom-in, wipe)
 * - Karaoke captions with brand styling
 * - Progress bar
 * - Real whisper.cpp transcription from video audio
 *
 * Usage:
 *   npx tsx scripts/demo-full.ts --input video.mp4
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { groupWordsIntoCues } from '@reelstack/transcription';
import type { ReelProps } from '../src/schemas/reel-props';
import { transcribeAudio } from '../src/pipeline/transcribe';
import { createRenderer } from '../src/render';

const REMOTION_PKG_DIR = path.resolve(import.meta.dirname, '..');

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
    console.error('Usage: npx tsx scripts/demo-full.ts --input <video.mp4>');
    process.exit(1);
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

  const probeJson = execSync(`ffprobe -v quiet -print_format json -show_format "${inputVideo}"`, {
    encoding: 'utf-8',
  });
  let probeData: any;
  try {
    probeData = JSON.parse(probeJson);
  } catch {
    console.error('Failed to parse JSON from ffprobe output');
    process.exit(1);
  }
  const videoDuration = parseFloat(probeData.format.duration);

  console.log('ReelStack FULL DEMO');
  console.log('═'.repeat(50));
  console.log(`Input: ${path.basename(inputVideo)} (${videoDuration.toFixed(1)}s)`);
  console.log('Features: split-screen, B-roll, transitions, karaoke, progress bar');
  console.log('═'.repeat(50));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-demo-'));

  try {
    // ── Step 1: Extract & transcribe ──────────────────────────
    console.log('  → Extracting audio...');
    const wavPath = path.join(tmpDir, 'audio.wav');
    execSync(`ffmpeg -y -i "${inputVideo}" -ar 16000 -ac 1 -f wav "${wavPath}"`, { stdio: 'pipe' });

    console.log('  → Transcribing with whisper.cpp...');
    const whisperStart = performance.now();
    const wavBuffer = fs.readFileSync(wavPath);
    const transcription = await transcribeAudio(wavBuffer, { language: 'pl' });
    console.log(
      `    ${transcription.words.length} words in ${((performance.now() - whisperStart) / 1000).toFixed(1)}s`
    );
    console.log(`    "${transcription.text.slice(0, 100)}..."`);

    // ── Step 2: Build cues ────────────────────────────────────
    console.log('  → Building cues...');
    const cues = groupWordsIntoCues(
      transcription.words,
      {
        maxWordsPerCue: 5,
        maxDurationPerCue: 2.5,
        breakOnPunctuation: true,
      },
      'karaoke'
    );
    console.log(`    ${cues.length} cues`);

    // ── Step 3: Copy video + extract audio to public/ ──────────
    console.log('  → Preparing assets...');
    const videoPublicPath = path.join(REMOTION_PKG_DIR, 'public', 'demo-input.mp4');
    const audioPublicPath = path.join(REMOTION_PKG_DIR, 'public', 'demo-audio.mp3');
    fs.copyFileSync(inputVideo, videoPublicPath);

    // Extract audio as separate track (all videos will be muted)
    execSync(`ffmpeg -y -i "${inputVideo}" -vn -acodec libmp3lame -q:a 2 "${audioPublicPath}"`, {
      stdio: 'pipe',
    });

    // ── Step 4: Build B-roll segments ─────────────────────────
    // Place B-roll at key moments based on content analysis
    // Using color placeholders with labels to show where real footage would go
    console.log('  → Composing B-roll segments...');

    // Architecture: base = always fullscreen video. All overlays (split-screen
    // AND B-roll cutaways) are in bRollSegments. Only ONE overlay at a time.
    // This guarantees exactly one transition per moment - never double.
    const bRollSegments: ReelProps['bRollSegments'] = [
      // ── Segments are in chronological order, no overlaps ───

      // 0-7s: fullscreen (no overlay = base video visible)

      // 7-11.5s: split-screen moment
      {
        startTime: 7,
        endTime: 11.5,
        media: { url: '', type: 'split-screen' as any },
        animation: 'none',
        transition: { type: 'crossfade', durationMs: 400 },
      },

      // 11.5-15.5s: B-ROLL "typing prompt"
      {
        startTime: 11.5,
        endTime: 15.5,
        media: { url: '#0D2137', type: 'color', label: '⌨️ B-ROLL: typing prompt' },
        animation: 'fade',
        transition: { type: 'slide-left', durationMs: 300 },
      },

      // 15.5-19.5s: fullscreen (no overlay)

      // 19.5-23s: B-ROLL "code preview"
      {
        startTime: 19.5,
        endTime: 23,
        media: { url: '#1A2E1A', type: 'color', label: '💻 B-ROLL: HTML code preview' },
        animation: 'spring-scale',
        transition: { type: 'zoom-in', durationMs: 500 },
      },

      // 23-26s: split-screen moment
      {
        startTime: 23,
        endTime: 26,
        media: { url: '', type: 'split-screen' as any },
        animation: 'none',
        transition: { type: 'crossfade', durationMs: 400 },
      },

      // 26-30s: B-ROLL "app building"
      {
        startTime: 26,
        endTime: 30,
        media: { url: '#2D1A2E', type: 'color', label: '⏳ B-ROLL: app building' },
        animation: 'fade',
        transition: { type: 'wipe', durationMs: 400 },
      },

      // 30-36s: fullscreen (no overlay)

      // 36-40s: B-ROLL "deploy & publish"
      {
        startTime: 36,
        endTime: 40,
        media: { url: '#1A2D2E', type: 'color', label: '🚀 B-ROLL: deploy & publish' },
        animation: 'spring-scale',
        transition: { type: 'slide-right', durationMs: 300 },
      },

      // 40-44s: fullscreen (no overlay)

      // 44-49s: B-ROLL "custom domain"
      {
        startTime: 44,
        endTime: 49,
        media: { url: '#2E2D1A', type: 'color', label: '🌐 B-ROLL: custom domain setup' },
        animation: 'fade',
        transition: { type: 'crossfade', durationMs: 500 },
      },

      // 49-end: fullscreen (no overlay)
    ];

    const fullscreenSegs = bRollSegments.filter((s) => s.media.type === 'video');
    const placeholderSegs = bRollSegments.filter((s) => s.media.type === 'color');
    console.log(
      `    ${bRollSegments.length} segments: ${fullscreenSegs.length} fullscreen, ${placeholderSegs.length} B-roll placeholders`
    );
    for (const seg of bRollSegments) {
      const label =
        seg.media.type === 'video'
          ? `FULLSCREEN (${seg.transition?.type})`
          : `${seg.media.label} (${seg.transition?.type})`;
      console.log(`      ${seg.startTime.toFixed(1)}s-${seg.endTime.toFixed(1)}s  ${label}`);
    }

    // ── Step 5: Build full ReelProps ──────────────────────────
    const props: ReelProps = {
      // SPLIT-SCREEN: talking head bottom, screen recording top (placeholder)
      layout: 'split-screen',
      primaryVideoUrl: 'demo-input.mp4',
      secondaryVideoUrl: undefined, // placeholder panel will show
      voiceoverUrl: 'demo-audio.mp3', // Separate audio track (videos are muted)

      bRollSegments,

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

      // TechSkills Academy brand caption style
      captionStyle: {
        fontFamily: colorPreset?.fontFamily ?? 'Outfit, sans-serif',
        fontSize: 48,
        fontColor: colorPreset?.fontColor ?? '#F5F5F0',
        fontWeight: 'bold',
        fontStyle: 'normal',
        backgroundColor: colorPreset?.backgroundColor ?? '#0E0E12',
        backgroundOpacity: colorPreset?.backgroundOpacity ?? 0.85,
        outlineColor: colorPreset?.outlineColor ?? '#0E0E12',
        outlineWidth: colorPreset?.outlineWidth ?? 3,
        shadowColor: colorPreset?.shadowColor ?? '#000000',
        shadowBlur: colorPreset?.shadowBlur ?? 12,
        position: 67,
        alignment: 'center',
        lineHeight: 1.3,
        padding: 14,
        highlightColor: colorPreset?.highlightColor ?? '#F59E0B',
        upcomingColor: colorPreset?.upcomingColor ?? '#8888A0',
        highlightMode: (args['highlight'] as any) ?? colorPreset?.highlightMode ?? 'text',
        textTransform: (args['uppercase'] === 'true'
          ? 'uppercase'
          : (colorPreset?.textTransform ?? 'none')) as any,
        pillColor: colorPreset?.pillColor ?? '#F59E0B',
        pillBorderRadius: colorPreset?.pillBorderRadius ?? 10,
        pillPadding: colorPreset?.pillPadding ?? 12,
      },

      musicVolume: 0,
      showProgressBar: true,
      backgroundColor: '#0E0E12', // TechSkills bg
    };

    // ── Step 6: Render ────────────────────────────────────────
    console.log('  → Rendering full composition...');
    const renderStart = performance.now();

    const outputPath = args['output'] ?? path.join(REMOTION_PKG_DIR, 'out', 'demo-full.mp4');
    const renderer = createRenderer();
    const result = await renderer.render(props, { outputPath });

    const renderSec = (result.durationMs / 1000).toFixed(1);
    console.log(`  → Render complete: ${renderSec}s`);

    // ── Cleanup ───────────────────────────────────────────────
    if (fs.existsSync(videoPublicPath)) fs.unlinkSync(videoPublicPath);
    if (fs.existsSync(audioPublicPath)) fs.unlinkSync(audioPublicPath);

    const fileSize = fs.statSync(outputPath).size;

    console.log('');
    console.log('═'.repeat(50));
    console.log('DEMO FEATURES USED:');
    console.log('  ✓ Split-screen layout (talking head + screen recording placeholder)');
    console.log(`  ✓ ${fullscreenSegs.length} fullscreen moments (video covers split-screen)`);
    console.log('  ✓ Karaoke captions (Outfit font, TechSkills amber highlight)');
    console.log(`  ✓ ${placeholderSegs.length} B-roll placeholders with transitions:`);
    console.log('      crossfade, slide-left, slide-right, zoom-in, wipe');
    console.log('  ✓ whisper.cpp transcription (word-level timestamps)');
    console.log('  ✓ Progress bar');
    console.log('  ✓ Brand colors (#0E0E12 bg, #F59E0B amber, #F5F5F0 text)');
    console.log('═'.repeat(50));
    console.log(`Output: ${outputPath}`);
    console.log(`Size:   ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Duration: ${videoDuration.toFixed(1)}s`);
    console.log(`Render time: ${renderSec}s`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Demo failed:', err.message ?? err);
  process.exit(1);
});
