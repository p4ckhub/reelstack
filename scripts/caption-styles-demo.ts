#!/usr/bin/env bun
/**
 * Caption styles demo — render the same 12-second sample clip with all
 * 8 highlight modes side-by-side. Zero paid API: cues are fabricated, no
 * TTS, no Whisper, no LLM. Pure local Remotion render.
 *
 *   bun run scripts/caption-styles-demo.ts [sourceVideo]
 *
 * Output: ~/Downloads/caption-demos/<mode>.mp4 (8 files).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LocalRenderer } from '../packages/remotion/src/render/local-renderer';
import type { CaptionCue } from '../packages/remotion/src/schemas/caption-cue';
import type { VideoClipProps } from '../packages/remotion/src/schemas/video-clip-props';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const useSynthetic = process.argv.includes('--synthetic');

/**
 * Build a clean 1080x1920 background with a slow purple→navy gradient
 * sweep so the eye sees motion (it's clearly a video, not a still) but
 * nothing competes with the caption overlay. ffmpeg `gradients` filter
 * has built-in motion via `speed`.
 */
function buildSyntheticBackground(outPath: string, durationSeconds: number) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `gradients=s=1080x1920:c0=0x141428:c1=0x3a1f5c:type=radial:speed=0.01:duration=${durationSeconds}`,
      '-t',
      String(durationSeconds),
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      outPath,
    ],
    { stdio: 'pipe' }
  );
}

const SOURCE_VIDEO = useSynthetic
  ? path.join(os.tmpdir(), 'caption-demo-synthetic-bg.mp4')
  : (positional[0] ?? path.join(os.homedir(), 'Downloads', 'agent-vs-chatbot.mp4'));

if (useSynthetic && !fs.existsSync(SOURCE_VIDEO)) {
  console.log(`Generating synthetic background → ${SOURCE_VIDEO}`);
  buildSyntheticBackground(SOURCE_VIDEO, 12);
}
const OUT_DIR = path.join(
  os.homedir(),
  'Downloads',
  useSynthetic ? 'caption-demos-clean' : 'caption-demos'
);
const CLIP_DURATION = 12;

const ALL_HIGHLIGHT_MODES = [
  'pop-word',
  'hormozi',
  'pill',
  'glow',
  'underline-sweep',
  'box-highlight',
  'single-word',
  'text',
  'outline-pop',
] as const;

// Pass `--only=mode1,mode2` to render a subset (handy for re-renders after
// adding a new preset — no need to redo the 8 you already have).
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const HIGHLIGHT_MODES = onlyArg
  ? (onlyArg.slice('--only='.length).split(',') as readonly string[])
  : ALL_HIGHLIGHT_MODES;

if (!fs.existsSync(SOURCE_VIDEO)) {
  console.error(`Source video not found: ${SOURCE_VIDEO}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Remotion serves clip URLs through the bundler's public/ dir. The local
// renderer caches that bundle in /tmp; copy our sample into the source
// public/ so the next bundle pass picks it up. Cache key is computed from
// .ts/.tsx/.css mtimes so adding a .mp4 doesn't bust the cache by itself —
// fine, the file just needs to exist when the bundle is built.
const PUBLIC_DIR = path.join(__dirname, '..', 'packages', 'remotion', 'public');
const SAMPLE_BASENAME = useSynthetic ? 'caption-demo-sample-clean.mp4' : 'caption-demo-sample.mp4';
const samplePath = path.join(PUBLIC_DIR, SAMPLE_BASENAME);
const sampleStaleness =
  fs.existsSync(samplePath) && fs.statSync(SOURCE_VIDEO).mtimeMs > fs.statSync(samplePath).mtimeMs;
if (!fs.existsSync(samplePath) || sampleStaleness) {
  fs.copyFileSync(SOURCE_VIDEO, samplePath);
  console.log(`Copied sample → ${samplePath}`);
}

/**
 * Fabricated caption track. 4 cues × 3s, each with word-level timing so
 * highlight modes that walk per-word (pop-word, hormozi, single-word) have
 * something to animate.
 */
function buildCues(): CaptionCue[] {
  const sentences = [
    ['ReelStack', 'caption', 'styles'],
    ['eight', 'presets', 'available'],
    ['pick', 'your', 'favorite', 'look'],
    ['same', 'render', 'zero', 'cost'],
  ];
  const cues: CaptionCue[] = [];
  let t = 0;
  sentences.forEach((words, i) => {
    const cueDuration = 3.0;
    const wordDuration = cueDuration / words.length;
    cues.push({
      id: `cue-${i}`,
      text: words.join(' '),
      startTime: t,
      endTime: t + cueDuration,
      words: words.map((text, w) => ({
        text,
        startTime: t + w * wordDuration,
        endTime: t + (w + 1) * wordDuration,
      })),
    });
    t += cueDuration;
  });
  return cues;
}

const cues = buildCues();
const renderer = new LocalRenderer();

console.log(`Source: ${SOURCE_VIDEO}`);
console.log(`Output: ${OUT_DIR}`);
console.log(`Modes:  ${HIGHLIGHT_MODES.join(', ')}\n`);

let idx = 0;
for (const mode of HIGHLIGHT_MODES) {
  idx++;
  const outputPath = path.join(OUT_DIR, `${mode}.mp4`);
  const props: VideoClipProps = {
    clips: [
      {
        url: SAMPLE_BASENAME,
        startTime: 0,
        endTime: CLIP_DURATION,
        transition: 'none',
        transitionDurationMs: 0,
      },
    ],
    cues,
    durationSeconds: CLIP_DURATION,
    backgroundColor: '#000000',
    musicVolume: 0.15,
    highlightMode: mode,
    captionStyle: {
      fontSize: 64,
      fontColor: '#FFFFFF',
      highlightColor: '#F59E0B',
      position: 65,
      // outline-pop: no pill bg + grey upcoming words for the
      // 3-state karaoke read (white past / amber active / grey upcoming).
      ...(mode === 'outline-pop' ? { backgroundOpacity: 0, upcomingColor: '#8E8E9C' } : {}),
    },
  };

  const t0 = performance.now();
  console.log(`[${idx}/${HIGHLIGHT_MODES.length}] Rendering ${mode}…`);
  try {
    await renderer.render(props as unknown as Record<string, unknown>, {
      outputPath,
      compositionId: 'VideoClip',
    });
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0);
    console.log(`         done in ${sec}s — ${outputPath} (${sizeKB} KB)`);
  } catch (err) {
    console.error(`         FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\nAll done. open ${OUT_DIR}`);
