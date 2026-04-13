/**
 * Plan command - Build template montage plan from TTS output.
 */
import fs from 'fs';
import path from 'path';
import {
  B,
  G,
  R,
  Y,
  D,
  X,
  positional,
  opt,
  flag,
  save,
  outDir,
  setupRegistry,
  loadPrivateModules,
} from '../cli-utils';

export async function plan() {
  const ttsFile = positional(1);
  if (!ttsFile || !fs.existsSync(ttsFile)) {
    console.log(
      `Usage: bun run rs plan <tts.json> [--template jump-cut-dynamic]\n       bun run rs plan <tts.json> --director [--style dynamic]`
    );
    process.exit(1);
  }

  // Load private modules for premium templates
  await loadPrivateModules();

  const { buildTemplatePlan } = await import('../content/template-montage');
  const templateId = opt('template') ?? 'jump-cut-dynamic';

  const ttsData = JSON.parse(fs.readFileSync(ttsFile, 'utf-8'));

  console.log(`${B}Template Plan${X} (${templateId})`);
  console.log(`Audio: ${ttsData.audioDuration.toFixed(1)}s, Cues: ${ttsData.cues.length}`);

  // Build sections from words
  const words = ttsData.words as Array<{ text: string; startTime: number; endTime: number }>;
  const sections: Array<Record<string, unknown>> = [];
  const assets: Array<Record<string, unknown>> = [];
  let secStart = 0;
  let secWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    secWords.push(words[i].text);
    if (/[.!?]$/.test(words[i].text) || i === words.length - 1) {
      if (secWords.length >= 2) {
        const idx = sections.length;
        sections.push({
          index: idx,
          text: secWords.join(' '),
          startTime: words[secStart].startTime,
          endTime: words[i].endTime,
          assetId: `asset-${idx}`,
        });
        assets.push({
          id: `asset-${idx}`,
          url: `https://picsum.photos/1080/1920?random=${idx}`,
          type: 'image',
          role: 'illustration',
          description: secWords.join(' ').substring(0, 50),
          sectionIndex: idx,
        });
      }
      secStart = i + 1;
      secWords = [];
    }
  }

  // Check for primary video from heygen step
  let primaryVideo: Record<string, unknown> | undefined;
  const heygenFile = path.join(outDir, 'heygen.json');
  if (fs.existsSync(heygenFile)) {
    const hg = JSON.parse(fs.readFileSync(heygenFile, 'utf-8'));
    if (hg.url) {
      primaryVideo = {
        url: hg.url,
        durationSeconds: hg.durationSeconds ?? ttsData.audioDuration,
        framing: 'bottom-aligned',
        loop: (hg.durationSeconds ?? 0) < ttsData.audioDuration,
        source: 'heygen',
      };
      console.log(`Primary video: HeyGen (${hg.durationSeconds?.toFixed(1)}s)`);
    }
  }

  const content = {
    script: words.map((w: { text: string }) => w.text).join(' '),
    voiceover: {
      url: ttsData.voiceoverPath,
      durationSeconds: ttsData.audioDuration,
      source: 'tts',
    },
    cues: ttsData.cues,
    sections,
    assets,
    primaryVideo,
    metadata: { language: 'pl' },
  };

  let planResult;

  if (flag('director')) {
    // AI Director path - LLM plans shots based on script + timing
    const { planProduction } = await import('../planner/production-planner');
    const { buildTimingReference } = await import('../orchestrator/base-orchestrator');
    const { ToolRegistry } = await import('../registry/tool-registry');
    const { discoverTools } = await import('../registry/discovery');

    console.log(`${B}AI Director${X}`);
    console.log(`  ${D}Discovering tools...${X}`);
    const registry = new ToolRegistry();
    for (const tool of discoverTools()) registry.register(tool);
    await registry.discover();
    const manifest = registry.getToolManifest();
    console.log(
      `  ${D}Tools: ${manifest.tools
        .filter((t: { available: boolean }) => t.available)
        .map((t: { id: string }) => t.id)
        .join(', ')}${X}`
    );

    const timingReference = buildTimingReference(words);
    const style = (opt('style') ?? 'dynamic') as 'dynamic' | 'calm' | 'cinematic' | 'educational';

    // Load user-provided assets if --assets <dir> specified
    const assetsPath = opt('assets');
    let userAssets: Array<{
      id: string;
      path: string;
      url: string;
      type: 'image' | 'video';
      description: string;
    }> = [];

    if (assetsPath) {
      const resolvedPath = path.resolve(assetsPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(`${R}Assets dir not found: ${resolvedPath}${X}`);
        process.exit(1);
      }

      const { createStorage } = await import('@reelstack/storage');
      const { describeAsset } = await import('../planner/asset-describer');
      const storage = await createStorage();

      const files = fs.readdirSync(resolvedPath).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov'].includes(ext);
      });

      console.log(`  ${D}User assets: ${files.length} files from ${resolvedPath}${X}`);
      console.log(`  ${D}Describing assets (vision)...${X}`);

      for (const file of files) {
        const filePath = path.join(resolvedPath, file);
        const ext = path.extname(file).toLowerCase();
        const videoExts = ['.mp4', '.webm', '.mov'];
        const isVideo = videoExts.includes(ext);
        const id = `user-${path.basename(file, ext)}`;

        // Describe with vision model
        const description = await describeAsset(filePath);

        // Upload to R2
        const key = `user-assets/${id}-${Date.now()}${ext}`;
        await storage.upload(fs.readFileSync(filePath), key);
        const url = await storage.getSignedUrl(key, 7200);

        userAssets.push({
          id,
          path: filePath,
          url,
          type: isVideo ? 'video' : 'image',
          description,
        });
        console.log(`  ${D}  ${id}: ${description}${X}`);
      }
    }

    console.log(`  ${D}Planning (${style})...${X}`);
    planResult = await planProduction({
      script: content.script,
      durationEstimate: ttsData.audioDuration,
      style,
      toolManifest: manifest,
      primaryVideoUrl: primaryVideo?.url as string | undefined,
      layout: (opt('layout') as 'fullscreen' | undefined) ?? 'fullscreen',
      timingReference,
      ...(userAssets.length > 0 ? { userAssets } : {}),
    });
  } else {
    // Template path - deterministic, zero LLM
    planResult = buildTemplatePlan(content as never, templateId);
  }

  save('plan.json', planResult);
  save('content.json', content);

  console.log(`Layout: ${planResult.layout}`);
  console.log(
    `Shots: ${planResult.shots.length} (${planResult.shots.map((s: { shotLayout?: string }) => s.shotLayout).join(', ')})`
  );
  console.log(
    `Zooms: ${planResult.zoomSegments?.length ?? 0}, SFX: ${planResult.sfxSegments?.length ?? 0}`
  );
  console.log(`${G}Done${X}`);
  console.log(`${D}Next: bun run rs assemble ${outDir}/plan.json ${outDir}/tts.json${X}`);
}
