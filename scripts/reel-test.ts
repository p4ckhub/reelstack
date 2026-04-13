#!/usr/bin/env bun
/**
 * Quick reel test CLI — your main tool for testing the pipeline.
 *
 * Usage:
 *   bun run scripts/reel-test.ts                    # default demo script
 *   bun run scripts/reel-test.ts "Your script text"  # custom script
 *   bun run scripts/reel-test.ts --template rapid-content
 *   bun run scripts/reel-test.ts --skip-render       # stop before render (just plan)
 *   bun run scripts/reel-test.ts --from-step plan    # reuse TTS from previous run
 *   bun run scripts/reel-test.ts --heygen            # generate HeyGen avatar as primary
 *   bun run scripts/reel-test.ts --heygen --avatar-iv # HeyGen Avatar IV mode
 *
 * All intermediate outputs saved to /tmp/reel-test/ for inspection.
 * Open the output MP4 in QuickTime or VLC to review.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  runTTSPipeline,
  buildTemplatePlan,
  assembleComposition,
  renderVideo,
} from '../packages/agent/src/index';
import { HeyGenTool } from '../packages/agent/src/tools/heygen-tool';
import type {
  ContentPackage,
  ContentAsset,
  ContentSection,
} from '../packages/agent/src/content/content-package';
import type { GeneratedAsset } from '../packages/agent/src/types';

// ── Parse args ───────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));

const scriptText =
  positional[0] ||
  'AI zmieni sposób w jaki pracujesz. To nie jest kwestia przyszłości. To się dzieje teraz. Wystarczy że zaczniesz używać odpowiednich narzędzi. Link w bio.';
const templateId = args.includes('--template')
  ? args[args.indexOf('--template') + 1]
  : 'jump-cut-dynamic';
const skipRender = flags.has('--skip-render');
const useHeygen = flags.has('--heygen');
const avatarIV = flags.has('--avatar-iv');
const fromStep = args.includes('--from-step') ? args[args.indexOf('--from-step') + 1] : null;

const OUT = '/tmp/reel-test';
fs.mkdirSync(OUT, { recursive: true });

const B = '\x1b[36m',
  G = '\x1b[32m',
  Y = '\x1b[33m',
  R = '\x1b[31m',
  D = '\x1b[2m',
  X = '\x1b[0m';

function step(name: string) {
  console.log(`\n${B}━━━ ${name} ━━━${X}`);
}

function save(name: string, data: unknown) {
  const file = path.join(OUT, name);
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(file, content);
  console.log(`  ${D}saved: ${file}${X}`);
}

function elapsed(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}

// ── Step 1: TTS + Whisper ────────────────────────────────────

let ttsResult: Awaited<ReturnType<typeof runTTSPipeline>>;

if (fromStep && fromStep !== 'tts') {
  step('1. TTS + Whisper (SKIPPED — loading from cache)');
  const cached = JSON.parse(fs.readFileSync(path.join(OUT, '01-tts.json'), 'utf-8'));
  ttsResult = cached;
  console.log(`  ${D}audio: ${cached.audioDuration.toFixed(1)}s, cues: ${cached.cues.length}${X}`);
} else {
  step('1. TTS + Whisper');
  console.log(`  Script: "${scriptText.substring(0, 80)}..."`);
  const t0 = performance.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-test-'));
  ttsResult = await runTTSPipeline(
    {
      script: scriptText,
      tts: { provider: 'edge-tts', voice: 'pl-PL-MarekNeural', language: 'pl-PL' },
    },
    tmpDir,
    (msg) => console.log(`  ${D}${msg}${X}`)
  );
  console.log(
    `  ${G}Done${X} in ${elapsed(t0)}: ${ttsResult.audioDuration.toFixed(1)}s audio, ${ttsResult.cues.length} cues`
  );

  // Copy voiceover to output dir
  fs.copyFileSync(ttsResult.voiceoverPath, path.join(OUT, 'voiceover.mp3'));
  save('01-tts.json', {
    voiceoverPath: path.join(OUT, 'voiceover.mp3'),
    audioDuration: ttsResult.audioDuration,
    cues: ttsResult.cues,
    words: ttsResult.transcriptionWords,
  });
  ttsResult.voiceoverPath = path.join(OUT, 'voiceover.mp3');
}

// ── Step 2: HeyGen avatar (optional) ─────────────────────────

let primaryVideoUrl: string | undefined;
let primaryVideoDuration: number | undefined;

if (useHeygen) {
  if (fromStep && fromStep !== 'tts' && fromStep !== 'heygen') {
    step('2. HeyGen Avatar (SKIPPED — loading from cache)');
    const cached = JSON.parse(fs.readFileSync(path.join(OUT, '02-heygen.json'), 'utf-8'));
    primaryVideoUrl = cached.url;
    primaryVideoDuration = cached.durationSeconds;
    console.log(`  ${D}${cached.url?.substring(0, 60)}... (${cached.durationSeconds}s)${X}`);
  } else {
    step('2. HeyGen Avatar');
    if (!process.env.HEYGEN_API_KEY) {
      console.log(`  ${R}HEYGEN_API_KEY not set — skipping${X}`);
    } else {
      const tool = new HeyGenTool();
      const t0 = performance.now();

      const genResult = await tool.generate({
        purpose: 'Primary talking head',
        script: scriptText,
        aspectRatio: '9:16',
        ...(avatarIV
          ? {
              heygen_character: {
                use_avatar_iv_model: true,
                prompt: 'The presenter speaks naturally with hand gestures, nodding at key points',
              },
              heygen_voice: { emotion: 'Friendly' },
            }
          : {}),
      });

      if (genResult.status === 'failed') {
        console.log(`  ${R}Generate failed: ${genResult.error}${X}`);
      } else {
        console.log(`  Job: ${genResult.jobId} — polling...`);
        let poll = genResult;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          poll = await tool.poll(genResult.jobId);
          const sec = (i + 1) * 5;
          if (poll.status === 'completed') {
            console.log(`  ${G}Done${X} in ${sec}s: ${poll.durationSeconds?.toFixed(1)}s video`);
            break;
          }
          if (poll.status === 'failed') {
            console.log(`  ${R}Failed: ${poll.error}${X}`);
            break;
          }
          if (sec % 30 === 0) console.log(`  ${D}${sec}s: still processing...${X}`);
        }
        if (poll.status === 'completed' && poll.url) {
          primaryVideoUrl = poll.url;
          primaryVideoDuration = poll.durationSeconds;
          save('02-heygen.json', { url: poll.url, durationSeconds: poll.durationSeconds });
        }
      }
      console.log(`  Total: ${elapsed(t0)}`);
    }
  }
} else {
  step('2. HeyGen Avatar (SKIPPED — use --heygen to enable)');
}

// ── Step 3: Build ContentPackage ─────────────────────────────

step('3. Build ContentPackage');

// Create sections from word timing (split on sentence boundaries)
const words = ttsResult.transcriptionWords;
const sections: ContentSection[] = [];
const assets: ContentAsset[] = [];
let sectionStart = 0;
let sectionWords: string[] = [];

for (let i = 0; i < words.length; i++) {
  sectionWords.push(words[i].text);
  const isSentenceEnd = /[.!?]$/.test(words[i].text) || i === words.length - 1;

  if (isSentenceEnd && sectionWords.length >= 2) {
    const idx = sections.length;
    const assetId = `placeholder-${idx}`;
    sections.push({
      index: idx,
      text: sectionWords.join(' '),
      startTime: words[sectionStart].startTime,
      endTime: words[i].endTime,
      assetId,
    });
    assets.push({
      id: assetId,
      url: `https://picsum.photos/1080/1920?random=${idx}`, // placeholder image
      type: 'image',
      role: 'illustration',
      description: sectionWords.join(' ').substring(0, 50),
      sectionIndex: idx,
    });
    sectionStart = i + 1;
    sectionWords = [];
  }
}

const content: ContentPackage = {
  script: scriptText,
  voiceover: {
    url: ttsResult.voiceoverPath,
    durationSeconds: ttsResult.audioDuration,
    source: 'tts',
  },
  cues: ttsResult.cues,
  sections,
  assets,
  primaryVideo: primaryVideoUrl
    ? {
        url: primaryVideoUrl,
        durationSeconds: primaryVideoDuration ?? ttsResult.audioDuration,
        framing: 'bottom-aligned',
        loop: (primaryVideoDuration ?? 0) < ttsResult.audioDuration,
        source: 'heygen',
      }
    : undefined,
  metadata: { language: 'pl' },
};

save('03-content-package.json', content);
console.log(`  Sections: ${sections.length}, Assets: ${assets.length}`);
console.log(
  `  Primary video: ${primaryVideoUrl ? 'HeyGen' : 'none (template will use head shots without video)'}`
);

// ── Step 4: Template plan ────────────────────────────────────

step(`4. Template Plan (${templateId})`);

// Load private modules for premium templates
try {
  await import('../packages/modules/src/index');
} catch {
  /* no private modules */
}

const plan = buildTemplatePlan(content, templateId);
save('04-plan.json', plan);
console.log(`  Layout: ${plan.layout}`);
console.log(`  Shots: ${plan.shots.length} (${plan.shots.map((s) => s.shotLayout).join(', ')})`);
console.log(`  Zooms: ${plan.zoomSegments.length}, SFX: ${plan.sfxSegments?.length ?? 0}`);
console.log(
  `  Caption: ${(plan.captionStyle as Record<string, unknown>)?.highlightMode} + ${(plan.captionStyle as Record<string, unknown>)?.animationStyle}`
);

// ── Step 5: Assemble composition ─────────────────────────────

step('5. Assemble Composition');

const genAssets: GeneratedAsset[] = [];
for (const shot of plan.shots) {
  if (shot.visual.type !== 'b-roll') continue;
  const sq = (shot.visual as { searchQuery?: string }).searchQuery;
  const ca = content.assets.find((a) => a.id === sq);
  if (ca) {
    genAssets.push({
      toolId: 'placeholder',
      shotId: shot.id,
      url: ca.url,
      type: 'stock-image',
    });
  }
}

const props = assembleComposition({
  plan,
  assets: genAssets,
  cues: content.cues.map((c) => ({
    id: c.id,
    text: c.text,
    startTime: c.startTime,
    endTime: c.endTime,
    words: c.words?.map((w) => ({ ...w })),
  })),
  voiceoverFilename: content.voiceover.url,
  primaryVideoObjectPosition: 'center 85%',
});

save('05-composition.json', props);
console.log(`  B-roll segments: ${props.bRollSegments?.length ?? 0}`);
console.log(
  `  Caption style: font=${props.captionStyle?.fontSize}px, highlight=${props.captionStyle?.highlightMode}`
);

if (skipRender) {
  step('6. Render (SKIPPED — use without --skip-render)');
  console.log(`\n${G}Done!${X} Inspect outputs in ${OUT}/`);
  console.log(`  01-tts.json        — word timing + cues`);
  console.log(`  03-content-package — sections + assets`);
  console.log(`  04-plan.json       — shots, zooms, SFX, captions`);
  console.log(`  05-composition.json — final Remotion props`);
  console.log(`  voiceover.mp3      — generated audio`);
  process.exit(0);
}

// ── Step 6: Render ───────────────────────────────────────────

step('6. Remotion Render');
const outputPath = path.join(OUT, 'output.mp4');
const t0 = performance.now();

try {
  const result = await renderVideo(props as unknown as Record<string, unknown>, outputPath, (msg) =>
    console.log(`  ${D}${msg}${X}`)
  );
  console.log(`  ${G}Done${X} in ${elapsed(t0)}: ${result.outputPath}`);
  console.log(`\n${G}Output: ${result.outputPath}${X}`);
  console.log(`Open: ${D}open ${result.outputPath}${X}`);
} catch (err) {
  console.log(`  ${R}Render failed: ${err instanceof Error ? err.message : err}${X}`);
  console.log(`  ${Y}Tip: first render bundles Remotion (~60s). Retry if timeout.${X}`);
}
