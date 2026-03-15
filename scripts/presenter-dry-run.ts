/**
 * Dry-run presenter pipeline.
 *
 * REAL: LLM script, TTS voiceover, Whisper timing, template montage, assembly, render
 * MOCKED: Board images/videos (colored placeholders with prompt text)
 *
 * Zero API credits for image/video generation.
 * Full visual output for verifying script quality, timing, captions, layout.
 *
 * Usage: bun run scripts/presenter-dry-run.ts [templateId]
 * Templates: rapid-content | hybrid-dynamic | pip-tutorial | anchor-bottom-simple
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { generatePresenterScript } from '../packages/modules/src/private/agent/generators/presenter-script-generator';
import type { PresenterScript } from '../packages/modules/src/private/agent/generators/presenter-script-generator';
import {
  callLLM,
  runTTSPipeline,
  uploadVoiceover,
  buildTemplatePlan,
  assembleComposition,
} from '../packages/agent/src/index';
import type {
  ContentPackage,
  ContentSection,
  ContentAsset,
  PrimaryVideo,
} from '../packages/agent/src/content/content-package';
import type { GeneratedAsset } from '../packages/agent/src/types';

const TEMPLATE_ID = process.argv[2] ?? 'rapid-content';
const TOPIC =
  process.argv[3] ??
  'Agent AI vs chatbot - fundamentalna różnica. Chatbot odpowiada, agent działa.';
const TARGET_DURATION = parseInt(process.argv[4] ?? '30', 10);
const AVATAR_PATH = '/Users/pavvel/Downloads/presenter-loop.mp4';
const AVATAR_DURATION = 8;
const OUT_DIR = '/tmp/presenter-dry-run';
const MOCK_DIR = path.resolve(__dirname, '../packages/remotion/public');

fs.mkdirSync(MOCK_DIR, { recursive: true });

function log(step: string, msg: string) {
  console.log(`\n${'='.repeat(60)}\n[${step}] ${msg}\n${'='.repeat(60)}`);
}

function save(name: string, data: unknown) {
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Mock board generator ─────────────────────────────────────────────────────
// Creates colored images/videos with prompt text overlay. No API calls.

const COLORS = [
  '0x2563EB',
  '0xDC2626',
  '0x16A34A',
  '0x9333EA',
  '0xEA580C',
  '0x0891B2',
  '0xDB2777',
  '0x65A30D',
  '0x7C3AED',
  '0xC2410C',
  '0x0D9488',
  '0xE11D48',
];

/** Returns absolute path in public/ (resolveMediaUrl extracts filename → staticFile) */
function mockImage(index: number, prompt: string): string {
  const color = COLORS[index % COLORS.length];
  const outPath = path.join(MOCK_DIR, `mock-board-${index}.png`);
  // Use 9:16 aspect ratio (1080x1920) — same as real AI-generated boards
  const label = prompt.substring(0, 40).replace(/'/g, '').replace(/"/g, '');
  try {
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${color}:s=1080x1920:d=1" -frames:v 1 -vf "drawtext=text='[${index}] ${label}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/System/Library/Fonts/Helvetica.ttc" -update 1 "${outPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Fallback without text (fontfile might not exist)
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${color}:s=1080x1920:d=1" -frames:v 1 -update 1 "${outPath}"`,
      { stdio: 'pipe' }
    );
  }
  return outPath;
}

function mockVideo(index: number, prompt: string): string {
  const color = COLORS[index % COLORS.length];
  const outPath = path.join(MOCK_DIR, `mock-board-${index}.mp4`);
  const label = prompt.substring(0, 40).replace(/'/g, '');
  try {
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${color}:s=1080x1920:d=5,format=yuv420p" -t 5 -vf "drawtext=text='[${index}] VIDEO ${label}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/System/Library/Fonts/Helvetica.ttc" "${outPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${color}:s=1080x1920:d=5,format=yuv420p" -t 5 "${outPath}"`,
      { stdio: 'pipe' }
    );
  }
  return outPath;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\nDRY RUN: template=${TEMPLATE_ID}, target=${TARGET_DURATION}s, topic="${TOPIC.substring(0, 60)}..."\n`
  );

  // ── STEP 1: Script ──────────────────────────────────────────
  log('1/7', 'Script Generation (LLM) — REAL');

  const script = await generatePresenterScript({
    topic: TOPIC,
    llmCall: callLLM,
    persona: 'animated-dev',
    style: 'aggressive-funny',
    language: 'pl',
    targetDuration: TARGET_DURATION,
  });

  const allText = [script.hook, ...script.sections.map((s) => s.text), script.cta].join(' ');
  const totalWords = allText.split(/\s+/).length;
  const estDuration = totalWords / 2.5;

  console.log(`  Hook: "${script.hook}"`);
  console.log(`  Sections: ${script.sections.length}`);
  for (const [i, s] of script.sections.entries()) {
    const w = s.text.split(/\s+/).length;
    console.log(
      `    [${i}] ${w}w (~${(w / 2.5).toFixed(1)}s) [${s.boardImageSpec.type}] "${s.text}"`
    );
    console.log(`         prompt: "${s.boardImageSpec.prompt?.substring(0, 70)}"`);
  }
  console.log(`  CTA: "${script.cta}"`);
  console.log(
    `  Total: ${totalWords} words → ~${estDuration.toFixed(0)}s (target: ${TARGET_DURATION}s)`
  );

  if (estDuration > TARGET_DURATION * 1.4)
    console.log(`  ⚠️  OVER TARGET by ${((estDuration / TARGET_DURATION - 1) * 100).toFixed(0)}%`);
  if (script.sections.length < 5) console.log(`  ⚠️  FEW SECTIONS: ${script.sections.length}`);

  save('01-script', script);

  // ── STEP 2: Mock Boards ─────────────────────────────────────
  log('2/7', 'Board Generation — MOCKED (colored placeholders)');

  const boardResults: Array<{ index: number; url: string; type: string }> = [];
  for (const [i, section] of script.sections.entries()) {
    const isVideo = section.boardImageSpec.type === 'ai-video';
    const url = isVideo
      ? mockVideo(i, section.boardImageSpec.prompt ?? section.text)
      : mockImage(i, section.boardImageSpec.prompt ?? section.text);
    boardResults.push({ index: i, url, type: isVideo ? 'video' : 'image' });
    console.log(
      `  [${i}] ${isVideo ? '🎬' : '🖼️ '} ${path.basename(url)} (${section.boardImageSpec.type})`
    );
  }

  save('02-boards', boardResults);

  // ── STEP 3: TTS + Whisper ───────────────────────────────────
  log('3/7', 'TTS + Whisper — REAL');

  const fullScript = [script.hook, ...script.sections.map((s) => s.text), script.cta]
    .filter(Boolean)
    .join(' ');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-dry-'));
  const ttsResult = await runTTSPipeline(
    { script: fullScript, tts: { provider: 'edge-tts', voice: 'pl-PL-MarekNeural' }, whisper: {} },
    tmpDir,
    (step) => console.log(`    ${step}`)
  );

  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  console.log(`  Audio: ${ttsResult.audioDuration.toFixed(1)}s (target: ${TARGET_DURATION}s)`);
  console.log(`  Cues: ${ttsResult.cues.length}`);
  console.log(`  Words: ${ttsResult.cues.reduce((n, c) => n + (c.words?.length ?? 0), 0)}`);

  if (ttsResult.audioDuration > TARGET_DURATION * 1.4) {
    console.log(
      `  ⚠️  AUDIO OVER TARGET: ${ttsResult.audioDuration.toFixed(1)}s vs ${TARGET_DURATION}s`
    );
  }

  save('03-tts', {
    audioDuration: ttsResult.audioDuration,
    voiceoverUrl,
    cueCount: ttsResult.cues.length,
  });

  // ── STEP 4: Build ContentPackage ────────────────────────────
  log('4/7', 'Build ContentPackage');

  const allWords: Array<{ text: string; startTime: number }> = [];
  for (const cue of ttsResult.cues) {
    if (cue.words) {
      for (const w of cue.words) {
        allWords.push({ text: w.text.toLowerCase(), startTime: w.startTime });
      }
    }
  }

  const sections: ContentSection[] = [];
  let minStartTime = 0;
  for (let i = 0; i < script.sections.length; i++) {
    const sectionText = script.sections[i].text;
    const sectionWords = sectionText.toLowerCase().split(/\s+/).slice(0, 3);
    // Fallback: proportional distribution
    let bestStartTime = (i / script.sections.length) * ttsResult.audioDuration;
    // Try fuzzy match, but only forward (>= previous section end)
    for (let w = 0; w < allWords.length - 2; w++) {
      if (allWords[w].startTime < minStartTime) continue;
      if (
        allWords[w].text.includes(sectionWords[0]?.substring(0, 4) ?? '') &&
        sectionWords.length > 1 &&
        allWords[w + 1]?.text.includes(sectionWords[1]?.substring(0, 4) ?? '')
      ) {
        bestStartTime = allWords[w].startTime;
        break;
      }
    }
    // Ensure monotonic: each section starts after the previous
    bestStartTime = Math.max(bestStartTime, minStartTime);
    sections.push({
      index: i,
      text: sectionText,
      startTime: bestStartTime,
      endTime: ttsResult.audioDuration,
      assetId: `board-${i}`,
    });
    minStartTime = bestStartTime + 1; // at least 1s gap
  }
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i] = { ...sections[i], endTime: sections[i + 1].startTime };
  }

  const assets: ContentAsset[] = boardResults.map((br, i) => ({
    id: `board-${i}`,
    url: br.url,
    type: br.type as 'image' | 'video',
    role: 'board' as const,
    description: script.sections[i]?.text.substring(0, 80) ?? '',
    sectionIndex: i,
  }));

  const contentPackage: ContentPackage = {
    script: fullScript,
    voiceover: { url: voiceoverUrl, durationSeconds: ttsResult.audioDuration, source: 'tts' },
    cues: ttsResult.cues as ContentPackage['cues'],
    sections,
    assets,
    primaryVideo: {
      url: AVATAR_PATH,
      durationSeconds: AVATAR_DURATION,
      framing: 'bottom-aligned',
      loop: true,
      source: 'ai-avatar-loop',
    },
    metadata: { language: 'pl', style: 'dynamic' },
  };

  for (const s of sections) {
    console.log(
      `  [${s.index}] ${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s asset=${s.assetId}`
    );
  }

  save('04-content-package', contentPackage);

  // ── STEP 5: Template Montage ────────────────────────────────
  log('5/7', `Template Montage (${TEMPLATE_ID})`);

  const plan = buildTemplatePlan(contentPackage, TEMPLATE_ID);

  const headCount = plan.shots.filter((s) => s.shotLayout === 'head').length;
  const splitCount = plan.shots.filter((s) => s.shotLayout === 'split').length;
  const contentCount = plan.shots.filter((s) => s.shotLayout === 'content').length;
  const headTime = plan.shots
    .filter((s) => s.shotLayout === 'head')
    .reduce((t, s) => t + s.endTime - s.startTime, 0);
  const contentTime = plan.shots
    .filter((s) => s.shotLayout !== 'head')
    .reduce((t, s) => t + s.endTime - s.startTime, 0);

  console.log(
    `  Shots: ${plan.shots.length} (${headCount} head, ${splitCount} split, ${contentCount} content)`
  );
  console.log(
    `  Head time: ${headTime.toFixed(1)}s (${((headTime / ttsResult.audioDuration) * 100).toFixed(0)}%)`
  );
  console.log(
    `  Content time: ${contentTime.toFixed(1)}s (${((contentTime / ttsResult.audioDuration) * 100).toFixed(0)}%)`
  );
  console.log(`  Zooms: ${plan.zoomSegments.length}`);
  console.log(`  Caption: ${JSON.stringify(plan.captionStyle)}`);

  console.log('\n  Timeline:');
  for (const shot of plan.shots) {
    const dur = (shot.endTime - shot.startTime).toFixed(1);
    const vis =
      shot.visual.type === 'primary'
        ? '👤 PRESENTER'
        : `📺 ${(shot.visual as Record<string, unknown>).searchQuery}`;
    console.log(
      `    ${shot.startTime.toFixed(1)}s-${shot.endTime.toFixed(1)}s (${dur}s) [${shot.shotLayout}] ${vis}`
    );
  }

  save('05-plan', plan);

  // ── STEP 6: Assemble ────────────────────────────────────────
  log('6/7', 'Assemble Composition');

  const genAssets: GeneratedAsset[] = plan.shots
    .filter((s) => s.visual.type !== 'primary')
    .map((shot) => {
      const sq = (shot.visual as Record<string, unknown>).searchQuery as string;
      const ca = contentPackage.assets.find((a) => a.id === sq);
      return {
        toolId: 'user-upload',
        shotId: shot.id,
        url: ca?.url ?? '',
        type: (ca?.type === 'video' ? 'stock-video' : 'stock-image') as
          | 'stock-video'
          | 'stock-image',
      };
    })
    .filter((a) => a.url);

  const assembled = assembleComposition({
    plan,
    assets: genAssets,
    cues: contentPackage.cues.map((c) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: c.words ? [...c.words.map((w) => ({ ...w }))] : undefined,
    })),
    voiceoverFilename: voiceoverUrl,
    primaryVideoDurationSeconds: AVATAR_DURATION,
    primaryVideoObjectPosition: 'center 85%',
  });

  console.log(`  B-roll: ${assembled.bRollSegments.length} segments`);
  console.log(
    `  Caption: ${assembled.captionStyle?.highlightMode} / ${assembled.captionStyle?.highlightColor}`
  );

  save('06-assembled', assembled);

  // ── STEP 7: Render ──────────────────────────────────────────
  log('7/7', 'Render');

  const propsPath = path.join(OUT_DIR, 'render-props.json');
  const outputPath = `/Users/pavvel/Downloads/dry-run-${TEMPLATE_ID}.mp4`;

  fs.writeFileSync(propsPath, JSON.stringify(assembled, null, 2));

  execSync(`bunx remotion render Reel "${outputPath}" --props="${propsPath}"`, {
    cwd: path.resolve(__dirname, '../packages/remotion'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const stats = fs.statSync(outputPath);
  console.log(`\n✅ DONE: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

main().catch((err) => {
  console.error('\n❌ FAILED:', err.message ?? err);
  process.exit(1);
});
