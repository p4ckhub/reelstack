/**
 * Dry-run zoom-reframe pipeline.
 *
 * Takes an existing talking-head video, transcribes it, plans zoom edits via LLM,
 * adds captions, and renders LOCALLY (no Lambda).
 *
 * REAL: Whisper transcription, LLM zoom planning, caption rendering, Remotion render
 * COST: ~$0.01-0.03 LLM call (zoom planning)
 *
 * Usage: bun run scripts/zoom-reframe-dry-run.ts [videoPath] [intensity]
 * Intensities: subtle | standard | dramatic
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import {
  resolvePresetConfig,
  callLLMWithSystem,
  detectProvider,
} from '../packages/agent/src/index';
import { createLogger } from '../packages/logger/src/index';

const log = createLogger('zoom-dry-run');

const VIDEO_PATH = process.argv[2] ?? '/Users/pavvel/Downloads/dry-run-rapid-content.mp4';
const INTENSITY = (process.argv[3] ?? 'standard') as 'subtle' | 'standard' | 'dramatic';
const OUT_DIR = '/tmp/zoom-reframe-dry-run';

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Zoom presets ──────────────────────────────────────────────

interface ZoomIntensityConfig {
  medium: { min: number; max: number };
  dramatic: { min: number; max: number };
}

const ZOOM_PRESETS: Record<string, ZoomIntensityConfig> = {
  subtle: { medium: { min: 1.08, max: 1.15 }, dramatic: { min: 1.2, max: 1.3 } },
  standard: { medium: { min: 1.12, max: 1.25 }, dramatic: { min: 1.35, max: 1.5 } },
  dramatic: { medium: { min: 1.15, max: 1.3 }, dramatic: { min: 1.4, max: 1.6 } },
};

// ── LLM zoom planning prompt ──────────────────────────────────

const ZOOM_PLANNING_SYSTEM = `You are a professional short-form video editor specializing in talking-head reels. You plan smooth animated zoom transitions that make videos feel dynamic and professionally edited.

Analyze the transcript with word-level timing. Decide WHERE to place zoom changes and with what SPEED to create a visually engaging rhythm.

## Zoom levels (3 tiers)

- BASE (1.0x) — default wide shot, breathing room between punches
- MEDIUM (use values from the provided range) — the workhorse, creates "multi-cam" feel
- DRAMATIC (use values from the provided range) — max 1 per video, for THE single most impactful sentence

## Easing styles (vary these for rhythm!)

- "smooth" — S-curve ease-in-out, ~0.3s transition. Standard, snappy. Use for most zooms.
- "slow" — cinematic S-curve, ~0.5s transition. Use 2-3 times per video for variety. Great for:
  - Zooming into an important statement (builds anticipation)
  - Returning to base after a dramatic moment (lets it breathe)
  - Longer segments where you want a gentle feel

## Position shift (multi-cam simulation)

Alternate focus point horizontally:
- Base shots: focusX = 45 (slightly left)
- Medium shots: focusX = 55 (slightly right)
- Dramatic: focusX = 50 (dead center)
- focusY: keep 45-50

## Timing rules (CRITICAL)

1. Zoom changes MUST align with sentence or phrase boundaries. NEVER cut mid-word.
2. MINIMUM 2.5 seconds per segment. Shorter = frantic.
3. MAXIMUM 5 seconds per segment.
4. After dramatic zoom, hold BASE for at least 3 seconds (let the moment land).
5. NO CLUSTERING: if the previous segment was short (< 3s), make the next one longer (4-5s). Rhythm should breathe, not machine-gun.
6. Start and end with BASE.
7. Vary segment durations — mix of 2.5s, 3s, 4s, 5s segments. NOT all the same length.
8. STRICT ALTERNATION: always alternate base <-> zoomed. NEVER put two zoomed segments back-to-back (medium->medium or medium->dramatic). Always insert a base segment between them. This prevents "wave" artifacts from exit+entrance overlapping.

## Finding the dramatic moment

The dramatic zoom should be on:
- The KEY INSIGHT or thesis of the entire video (not just an emphatic phrase)
- Usually in the second half (after building context)
- A COMPLETE thought, held long enough to land (3-4s)

## Output format

JSON array, no markdown fences. Each segment:
{
  "startTime": number,
  "endTime": number,
  "scale": number,
  "focusX": number,
  "focusY": number,
  "easing": "smooth" | "slow",
  "reason": string
}

Segments must cover the ENTIRE duration. No gaps. Every second in exactly one segment.`;

// ── Pipeline ──────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Zoom Reframe Dry-Run`);
  console.log(`Video: ${VIDEO_PATH}`);
  console.log(`Intensity: ${INTENSITY}`);
  console.log(`${'='.repeat(60)}\n`);

  if (!fs.existsSync(VIDEO_PATH)) throw new Error(`Video not found: ${VIDEO_PATH}`);

  const startTime = performance.now();
  const elapsed = () => `${((performance.now() - startTime) / 1000).toFixed(1)}s`;
  const intensity = ZOOM_PRESETS[INTENSITY] ?? ZOOM_PRESETS.standard;

  // ── Step 1: Extract audio ──────────────────────────────────
  console.log(`[${elapsed()}] Step 1: Extract audio`);

  const audioPath = path.join(OUT_DIR, 'extracted-audio.wav');
  execSync(`ffmpeg -y -i "${VIDEO_PATH}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`, {
    stdio: 'pipe',
    timeout: 60_000,
  });

  const audioBuffer = fs.readFileSync(audioPath);
  const { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } =
    await import('../packages/remotion/src/pipeline/index');
  const { groupWordsIntoCues } = await import('../packages/transcription/src/index');

  const durationSeconds = getAudioDuration(audioBuffer, 'wav');
  console.log(`  Duration: ${durationSeconds.toFixed(1)}s`);

  // Convert to mp3 for Remotion voiceover (ReelComposition mutes primaryVideo)
  const voiceoverPath = path.join(OUT_DIR, 'voiceover.mp3');
  execSync(`ffmpeg -y -i "${audioPath}" -codec:a libmp3lame -b:a 128k "${voiceoverPath}"`, {
    stdio: 'pipe',
    timeout: 30_000,
  });

  // ── Step 2: Whisper transcribe ─────────────────────────────
  console.log(`[${elapsed()}] Step 2: Whisper transcription`);

  const wavBuffer = normalizeAudioForWhisper(audioBuffer, 'wav');
  const transcription = await transcribeAudio(wavBuffer, {
    language: 'pl',
    durationSeconds,
  });
  console.log(`  Words: ${transcription.words.length}`);

  // Offset + group into cues
  const WHISPER_OFFSET = 0.12;
  const offsetWords = transcription.words.map((w: any) => ({
    ...w,
    startTime: w.startTime + WHISPER_OFFSET,
    endTime: w.endTime + WHISPER_OFFSET,
  }));

  const cues = groupWordsIntoCues(
    offsetWords,
    {
      maxWordsPerCue: 6,
      maxDurationPerCue: 3,
      breakOnPunctuation: true,
    },
    'word-highlight'
  );
  console.log(`  Cues: ${cues.length}`);

  // Save intermediate
  fs.writeFileSync(path.join(OUT_DIR, 'cues.json'), JSON.stringify(cues, null, 2));

  // ── Step 3: LLM plans zoom edits ──────────────────────────
  console.log(`[${elapsed()}] Step 3: LLM zoom planning`);

  const transcript = cues
    .map((c: any) => {
      const words = c.words
        ?.map((w: any) => `[${w.startTime.toFixed(2)}-${w.endTime.toFixed(2)}] ${w.text}`)
        .join(' ');
      return words ?? `[${c.startTime.toFixed(2)}-${c.endTime.toFixed(2)}] ${c.text}`;
    })
    .join('\n');

  const userPrompt = `Video duration: ${durationSeconds.toFixed(1)}s

Zoom intensity config:
- Medium punch-in: scale ${intensity.medium.min}-${intensity.medium.max}
- Dramatic punch-in: scale ${intensity.dramatic.min}-${intensity.dramatic.max}
- Base: scale 1.0

Transcript with word-level timing:
${transcript}

Plan the zoom edits. Output ONLY a JSON array, no markdown fences.`;

  const provider = detectProvider();
  if (!provider) throw new Error('No LLM API key configured');

  const response = await callLLMWithSystem(provider, ZOOM_PLANNING_SYSTEM, userPrompt, {
    modelRole: 'planner',
    maxTokens: 4000,
  });

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  let zoomSegments: any[] = [];
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    zoomSegments = parsed.map((z: any) => {
      // LLM may return focusX as 0.45 (fraction) or 45 (percent) — normalize to percent
      let fx = z.focusX ?? 50;
      let fy = z.focusY ?? 48;
      if (fx <= 1) fx = fx * 100;
      if (fy <= 1) fy = fy * 100;
      return {
        startTime: z.startTime,
        endTime: z.endTime,
        scale: Math.max(1, Math.min(3, z.scale)),
        focusPoint: {
          x: Math.max(35, Math.min(65, fx)),
          y: Math.max(35, Math.min(60, fy)),
        },
        easing: z.easing === 'slow' ? 'slow' : 'smooth',
      };
    });
  } else {
    throw new Error('LLM did not return valid zoom plan');
  }

  // Safety: enforce alternation — insert base between consecutive zoomed segments
  const fixed: typeof zoomSegments = [];
  for (let i = 0; i < zoomSegments.length; i++) {
    const z = zoomSegments[i];
    const prev = fixed[fixed.length - 1];
    if (prev && prev.scale > 1.01 && z.scale > 1.01) {
      // Two zoomed back-to-back — insert a short base between them
      const midTime = (prev.endTime + z.startTime) / 2;
      // Shrink prev, insert base, shrink next
      prev.endTime = prev.endTime - 0.5;
      fixed.push({
        startTime: prev.endTime,
        endTime: z.startTime + 0.5,
        scale: 1.0,
        focusPoint: { x: 45, y: 48 },
        easing: 'smooth' as const,
      });
      z.startTime = z.startTime + 0.5;
    }
    fixed.push(z);
  }
  zoomSegments = fixed;

  console.log(`  Zoom segments: ${zoomSegments.length}`);
  for (const z of zoomSegments) {
    const type = z.scale >= 1.3 ? 'DRAMATIC' : z.scale > 1.0 ? 'medium' : 'base';
    console.log(
      `    ${z.startTime.toFixed(1)}-${z.endTime.toFixed(1)}s: ${z.scale.toFixed(2)}x (${type}) focus=(${z.focusPoint.x},${z.focusPoint.y}) ${z.easing}`
    );
  }

  fs.writeFileSync(path.join(OUT_DIR, 'zoom-plan.json'), JSON.stringify(zoomSegments, null, 2));

  // ── Step 4: Assemble ReelProps ─────────────────────────────
  console.log(`[${elapsed()}] Step 4: Assemble composition`);

  // Copy video + voiceover to public/ for Remotion local access
  const publicDir = path.resolve(__dirname, '../packages/remotion/public');
  fs.mkdirSync(publicDir, { recursive: true });

  const videoFilename = `zoom-source-${Date.now()}.mp4`;
  fs.copyFileSync(VIDEO_PATH, path.join(publicDir, videoFilename));

  const voiceoverFilename = `zoom-voiceover-${Date.now()}.mp3`;
  fs.copyFileSync(voiceoverPath, path.join(publicDir, voiceoverFilename));

  const reelProps = {
    primaryVideoUrl: videoFilename,
    primaryVideoObjectPosition: 'center',
    voiceoverUrl: voiceoverFilename,
    layout: 'fullscreen',
    durationSeconds,
    cues,
    captionStyle: {
      fontSize: 64,
      fontColor: '#FFFFFF',
      highlightColor: '#FFD700',
      highlightMode: 'hormozi',
      position: 80,
    },
    bRollSegments: [],
    effects: [],
    zoomSegments,
    pipSegments: [],
    lowerThirds: [],
    ctaSegments: [],
    counters: [],
    highlights: [],
    dynamicCaptionPosition: false,
    backgroundColor: '#000000',
    musicVolume: 0,
    scrollStopper: { preset: 'zoom-bounce', durationSeconds: 0.5 },
  };

  const propsPath = path.join(OUT_DIR, 'render-props.json');
  fs.writeFileSync(propsPath, JSON.stringify(reelProps, null, 2));

  // ── Step 5: Render locally ─────────────────────────────────
  console.log(`[${elapsed()}] Step 5: Render`);

  const outputPath = `/Users/pavvel/Downloads/zoom-reframe-${INTENSITY}.mp4`;

  execSync(`bunx remotion render Reel "${outputPath}" --props="${propsPath}"`, {
    cwd: path.resolve(__dirname, '../packages/remotion'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  // Cleanup temp files from public/
  try {
    fs.unlinkSync(path.join(publicDir, videoFilename));
    fs.unlinkSync(path.join(publicDir, voiceoverFilename));
  } catch {}

  const stats = fs.statSync(outputPath);
  console.log(
    `\n✅ DONE in ${elapsed()}: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
  );
}

main().catch((err) => {
  console.error('\n❌ FAILED:', err.message ?? err);
  console.error(err.stack);
  process.exit(1);
});
