/**
 * Step-by-step presenter pipeline with full intermediate logging.
 * Each step saves output to /tmp/presenter-steps/ for inspection.
 *
 * Usage: bun run scripts/presenter-step-by-step.ts
 */
import fs from 'fs';
import path from 'path';
import { generatePresenterScript } from '../packages/modules/src/private/agent/generators/presenter-script-generator';
import { resolveBoardImage } from '../packages/modules/src/private/agent/generators/board-image-resolver';
import {
  callLLM,
  runTTSPipeline,
  uploadVoiceover,
  persistAssetsToStorage,
  buildTemplatePlan,
  assembleComposition,
} from '../packages/agent/src/index';
import {
  createImageGenerator,
  createBestVideoGenerator,
  discoverAvailableTools,
} from '../packages/agent/src/index';
import type {
  ContentPackage,
  ContentSection,
  ContentAsset,
  PrimaryVideo,
} from '../packages/agent/src/content/content-package';
import type { GeneratedAsset } from '../packages/agent/src/types';

const OUT_DIR = '/tmp/presenter-steps';
fs.mkdirSync(OUT_DIR, { recursive: true });

function save(step: string, data: unknown) {
  const file = path.join(OUT_DIR, `${step}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  💾 Saved: ${file}`);
}

function log(msg: string) {
  console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`);
}

const TOPIC =
  'Agent AI vs chatbot - fundamentalna różnica. Chatbot odpowiada tekstem. Agent ma dostęp do terminala i sam zmienia kod, commituje, pushuje, sprawdza. Przez rok używałem AI jak Google. Potem dałem mu dostęp do mojego serwera.';
const AVATAR_PATH = '/Users/pavvel/Downloads/presenter-loop.mp4';
const AVATAR_DURATION = 8;
const PERSONA = 'animated-dev';
const STYLE = 'aggressive-funny' as const;
const LANGUAGE = 'pl';
const TARGET_DURATION = 30;

async function main() {
  // ── STEP 1: Script Generation ──────────────────────────────
  log('STEP 1: Script Generation (LLM)');

  const script = await generatePresenterScript({
    topic: TOPIC,
    llmCall: callLLM,
    persona: PERSONA,
    style: STYLE,
    language: LANGUAGE,
    targetDuration: TARGET_DURATION,
  });

  console.log(`  Hook: "${script.hook}"`);
  console.log(`  Sections: ${script.sections.length}`);
  for (const [i, s] of script.sections.entries()) {
    console.log(`    [${i}] ${s.boardImageSpec.type}: "${s.text.substring(0, 60)}..."`);
    console.log(`        prompt: "${s.boardImageSpec.prompt?.substring(0, 80)}..."`);
  }
  console.log(`  CTA: "${script.cta}"`);

  save('01-script', script);

  // ── STEP 2: Board Image/Video Generation ───────────────────
  log('STEP 2: Board Asset Generation');

  const imgTools = await discoverAvailableTools(['nanobanana', 'nanobanana2-kie']);
  const imageGen = imgTools.length > 0 ? createImageGenerator(imgTools) : null;
  let videoGenerator: Awaited<ReturnType<typeof createBestVideoGenerator>> | null = null;
  try {
    videoGenerator = await createBestVideoGenerator();
  } catch (e) {
    console.log('  ⚠️  No video generator available, using image only');
  }

  const imageResolverDeps = {
    generateImage: async (prompt: string) => {
      console.log(`    🖼️  Generating image: "${prompt.substring(0, 60)}..."`);
      if (imageGen) {
        const result = await imageGen.generate({ prompt, aspectRatio: '9:16' });
        return result.imageUrl;
      }
      if (videoGenerator) {
        const result = await videoGenerator.generate({ prompt, duration: 1, aspectRatio: '9:16' });
        return result.videoUrl;
      }
      throw new Error('No image generator available');
    },
    generateVideo: async (prompt: string) => {
      console.log(`    🎬 Generating video: "${prompt.substring(0, 60)}..."`);
      if (videoGenerator) {
        const result = await videoGenerator.generate({ prompt, duration: 5, aspectRatio: '9:16' });
        return result.videoUrl;
      }
      // Fallback to image
      console.log('    ⚠️  No video gen, falling back to image');
      return imageResolverDeps.generateImage(prompt);
    },
    searchImage: async (query: string) => imageResolverDeps.generateImage(query),
    takeScreenshot: async (_url: string) => {
      throw new Error('Screenshot not implemented');
    },
  };

  const boardResults: Array<{ index: number; url: string | null; type: string; error?: string }> =
    [];

  for (const [i, section] of script.sections.entries()) {
    console.log(`  Board ${i + 1}/${script.sections.length}: type=${section.boardImageSpec.type}`);
    try {
      const url = await resolveBoardImage(section.boardImageSpec, imageResolverDeps);
      boardResults.push({ index: i, url, type: section.boardImageSpec.type });
      console.log(`    ✅ URL: ${url.substring(0, 80)}...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`    ❌ FAILED: ${msg.substring(0, 100)}`);
      boardResults.push({ index: i, url: null, type: section.boardImageSpec.type, error: msg });
    }
  }

  save('02-boards', boardResults);

  const successBoards = boardResults.filter((b) => b.url);
  const failedBoards = boardResults.filter((b) => !b.url);
  console.log(`\n  Summary: ${successBoards.length} OK, ${failedBoards.length} failed`);

  // ── STEP 3: Persist Assets ─────────────────────────────────
  log('STEP 3: Persist Assets to Storage');

  const boardAssets: GeneratedAsset[] = [];
  for (const br of boardResults) {
    if (!br.url) continue;
    const isVideo = script.sections[br.index]?.boardImageSpec.type === 'ai-video';
    boardAssets.push({
      toolId: isVideo ? 'board-video' : 'board-image',
      shotId: `board-${br.index}`,
      url: br.url,
      type: isVideo ? 'ai-video' : 'ai-image',
    });
  }

  const avatarAsset: GeneratedAsset = {
    toolId: 'avatar-video',
    shotId: 'avatar',
    url: AVATAR_PATH,
    type: 'ai-video',
  };

  console.log(`  Persisting ${boardAssets.length} boards + 1 avatar...`);
  const persisted = await persistAssetsToStorage([...boardAssets, avatarAsset], undefined);

  const persistedBoards = persisted.filter((a) => a.toolId !== 'avatar-video');
  const persistedAvatar = persisted.find((a) => a.toolId === 'avatar-video');

  console.log(`  Avatar URL: ${persistedAvatar?.url.substring(0, 80)}`);
  for (const pb of persistedBoards) {
    console.log(`  Board ${pb.shotId}: ${pb.url.substring(0, 80)}`);
  }

  save('03-persisted', { boards: persistedBoards, avatar: persistedAvatar });

  // ── STEP 4: TTS + Whisper ──────────────────────────────────
  log('STEP 4: TTS + Whisper');

  const fullScript = [script.hook, ...script.sections.map((s) => s.text), script.cta]
    .filter(Boolean)
    .join(' ');

  console.log(`  Full script (${fullScript.length} chars): "${fullScript.substring(0, 100)}..."`);

  const tmpDir = fs.mkdtempSync('/tmp/reelstack-presenter-');
  const ttsResult = await runTTSPipeline(
    {
      script: fullScript,
      tts: { provider: 'edge-tts', voice: 'pl-PL-MarekNeural' },
      whisper: {},
    },
    tmpDir,
    (step) => console.log(`    ${step}`)
  );

  console.log(`  Audio duration: ${ttsResult.audioDuration}s`);
  console.log(`  Cues: ${ttsResult.cues.length}`);
  console.log(
    `  Words with timing: ${ttsResult.cues.reduce((n, c) => n + (c.words?.length ?? 0), 0)}`
  );

  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);
  console.log(`  Voiceover URL: ${voiceoverUrl.substring(0, 80)}`);

  save('04-tts', {
    audioDuration: ttsResult.audioDuration,
    voiceoverUrl,
    cueCount: ttsResult.cues.length,
    cues: ttsResult.cues,
  });

  // ── STEP 5: Build ContentPackage ───────────────────────────
  log('STEP 5: Build ContentPackage');

  // Match sections to timings
  const allWords: Array<{ text: string; startTime: number }> = [];
  for (const cue of ttsResult.cues) {
    if (cue.words) {
      for (const w of cue.words) {
        allWords.push({ text: w.text.toLowerCase(), startTime: w.startTime });
      }
    }
  }

  const sections: ContentSection[] = [];
  for (let i = 0; i < script.sections.length; i++) {
    const sectionText = script.sections[i].text;
    const sectionWords = sectionText.toLowerCase().split(/\s+/).slice(0, 3);

    let bestStartTime = (i / script.sections.length) * ttsResult.audioDuration;
    for (let w = 0; w < allWords.length - 2; w++) {
      if (
        allWords[w].text.includes(sectionWords[0]?.substring(0, 4) ?? '') &&
        sectionWords.length > 1 &&
        allWords[w + 1]?.text.includes(sectionWords[1]?.substring(0, 4) ?? '')
      ) {
        bestStartTime = allWords[w].startTime;
        break;
      }
    }

    sections.push({
      index: i,
      text: sectionText,
      startTime: bestStartTime,
      endTime: ttsResult.audioDuration,
      assetId: persistedBoards[i]?.shotId ?? undefined,
    });
  }

  // Fix endTimes
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i] = { ...sections[i], endTime: sections[i + 1].startTime };
  }

  const assets: ContentAsset[] = persistedBoards.map((a, i) => ({
    id: a.shotId ?? `board-${i}`,
    url: a.url,
    type: (a.type === 'ai-video' ? 'video' : 'image') as 'image' | 'video',
    role: 'board' as const,
    description: script.sections[i]?.text.substring(0, 80) ?? '',
    sectionIndex: i,
    durationSeconds: a.durationSeconds,
  }));

  const primaryVideo: PrimaryVideo = {
    url: persistedAvatar!.url,
    durationSeconds: AVATAR_DURATION,
    framing: 'bottom-aligned',
    loop: true,
    source: 'ai-avatar-loop',
  };

  const contentPackage: ContentPackage = {
    script: fullScript,
    voiceover: { url: voiceoverUrl, durationSeconds: ttsResult.audioDuration, source: 'tts' },
    cues: ttsResult.cues as ContentPackage['cues'],
    sections,
    assets,
    primaryVideo,
    metadata: { language: LANGUAGE, style: 'dynamic' },
  };

  console.log(`  Sections: ${sections.length}`);
  for (const s of sections) {
    console.log(
      `    [${s.index}] ${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s asset=${s.assetId ?? 'NONE'} "${s.text.substring(0, 50)}..."`
    );
  }
  console.log(`  Assets: ${assets.length}`);
  console.log(
    `  Primary video: ${primaryVideo.url.substring(0, 60)} (loop=${primaryVideo.loop}, ${primaryVideo.durationSeconds}s)`
  );

  save('05-content-package', contentPackage);

  // ── STEP 6: Template Montage Plan ──────────────────────────
  log('STEP 6: Template Montage (rapid-content)');

  const plan = buildTemplatePlan(contentPackage, 'rapid-content');

  console.log(`  Layout: ${plan.layout}`);
  console.log(`  Shots: ${plan.shots.length}`);
  console.log(`  Effects: ${plan.effects.length}`);
  console.log(`  Zooms: ${plan.zoomSegments.length}`);
  console.log(`  CaptionStyle: ${JSON.stringify(plan.captionStyle)}`);

  const splitCount = plan.shots.filter((s) => s.shotLayout === 'split').length;
  const contentCount = plan.shots.filter((s) => s.shotLayout === 'content').length;
  const headCount = plan.shots.filter((s) => s.shotLayout === 'head').length;
  console.log(`  Shot types: ${headCount} head, ${splitCount} split, ${contentCount} content`);

  console.log('\n  Timeline:');
  for (const shot of plan.shots) {
    const vis =
      shot.visual.type === 'primary'
        ? 'PRESENTER'
        : `B-ROLL(${(shot.visual as Record<string, unknown>).searchQuery})`;
    console.log(
      `    ${shot.id}: ${shot.startTime.toFixed(1)}s-${shot.endTime.toFixed(1)}s [${shot.shotLayout}] ${vis}`
    );
  }

  save('06-plan', plan);

  // ── STEP 7: Assemble Composition ───────────────────────────
  log('STEP 7: Assemble Composition');

  const genAssets: GeneratedAsset[] = plan.shots
    .filter((s) => s.visual.type !== 'primary')
    .map((shot) => {
      const sq = (shot.visual as Record<string, unknown>).searchQuery as string;
      const contentAsset = contentPackage.assets.find((a) => a.id === sq);
      return {
        toolId: 'user-upload',
        shotId: shot.id,
        url: contentAsset?.url ?? '',
        type: (contentAsset?.type === 'video' ? 'stock-video' : 'stock-image') as
          | 'stock-video'
          | 'stock-image',
        durationSeconds: contentAsset?.durationSeconds,
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

  console.log(`  Layout: ${assembled.layout}`);
  console.log(`  Primary: ${assembled.primaryVideoUrl?.substring(0, 60)}`);
  console.log(`  Primary loop: ${assembled.primaryVideoDurationSeconds}s`);
  console.log(`  B-roll segments: ${assembled.bRollSegments.length}`);
  console.log(`  Zoom segments: ${assembled.zoomSegments.length}`);
  console.log(
    `  Caption highlight: ${assembled.captionStyle?.highlightMode} / ${assembled.captionStyle?.highlightColor}`
  );

  for (const seg of assembled.bRollSegments) {
    const s = seg as Record<string, unknown>;
    const m = seg.media as Record<string, unknown>;
    console.log(
      `    ${Number(seg.startTime).toFixed(1)}s-${Number(seg.endTime).toFixed(1)}s [${s.shotLayout}] fit=${s.objectFit ?? 'cover'} anim=${seg.animation} ${m.type}:${String(m.url).substring(0, 50)}`
    );
  }

  save('07-assembled', assembled);

  // ── STEP 8: Render ─────────────────────────────────────────
  log('STEP 8: Render via Remotion CLI');

  const { execSync } = await import('child_process');
  const propsPath = path.join(OUT_DIR, 'render-props.json');
  const outputPath = '/Users/pavvel/Downloads/presenter-step-by-step.mp4';

  fs.writeFileSync(propsPath, JSON.stringify(assembled, null, 2));
  console.log(`  Props: ${propsPath}`);
  console.log(`  Output: ${outputPath}`);

  execSync(`bunx remotion render Reel "${outputPath}" --props="${propsPath}"`, {
    cwd: path.resolve(__dirname, '../packages/remotion'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const stats = fs.statSync(outputPath);
  console.log(`\n  ✅ DONE: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

main().catch((err) => {
  console.error('\n❌ FAILED:', err.message ?? err);
  process.exit(1);
});
