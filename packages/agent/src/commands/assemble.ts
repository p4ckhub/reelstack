/**
 * Assemble command - Compose Remotion props from plan + TTS data.
 */
import fs from 'fs';
import path from 'path';
import { B, G, Y, D, X, positional, save, outDir } from '../cli-utils';

export async function assemble() {
  const planFile = positional(1);
  const ttsFile = positional(2);
  if (!planFile || !ttsFile || !fs.existsSync(planFile) || !fs.existsSync(ttsFile)) {
    console.log(`Usage: bun run rs assemble <plan.json> <tts.json>`);
    process.exit(1);
  }

  const { assembleComposition } = await import('../orchestrator/composition-assembler');
  const planData = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  const ttsData = JSON.parse(fs.readFileSync(ttsFile, 'utf-8'));

  // Check if avatar is transparent (greenscreen/rmbg)
  const heygenFile = path.join(outDir, 'heygen.json');
  const heygenData = fs.existsSync(heygenFile)
    ? (JSON.parse(fs.readFileSync(heygenFile, 'utf-8')) as Record<string, unknown>)
    : null;

  console.log(`${B}Assemble Composition${X}`);
  if (heygenData?.transparent) {
    console.log(`${Y}Transparent avatar mode${X} (overlay on b-roll)`);
  }

  // Load generated assets (from `bun run rs assets`) if available
  const assetsFile = path.join(outDir, 'assets.json');
  const contentFile = path.join(outDir, 'content.json');
  let genAssets: Array<Record<string, unknown>> = [];

  if (fs.existsSync(assetsFile)) {
    // Real AI-generated assets - use these
    genAssets = JSON.parse(fs.readFileSync(assetsFile, 'utf-8'));
    console.log(`Assets: ${genAssets.length} from assets.json`);
  } else {
    // Fallback to content.json placeholders
    const content = fs.existsSync(contentFile)
      ? JSON.parse(fs.readFileSync(contentFile, 'utf-8'))
      : { assets: [] };
    for (const shot of planData.shots) {
      if (shot.visual?.type !== 'b-roll') continue;
      const ca = content.assets?.find((a: { id: string }) => a.id === shot.visual.searchQuery);
      if (ca)
        genAssets.push({
          toolId: 'placeholder',
          shotId: shot.id,
          url: ca.url,
          type: 'stock-image',
        });
    }
    console.log(`Assets: ${genAssets.length} placeholders from content.json`);
  }

  const props = assembleComposition({
    plan: planData,
    assets: genAssets as never,
    cues: ttsData.cues.map((c: Record<string, unknown>) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: (c.words as unknown[])?.map((w: unknown) => ({ ...(w as object) })),
    })),
    voiceoverFilename: ttsData.voiceoverPath,
    primaryVideoObjectPosition: 'center 85%',
    ...(heygenData?.transparent ? { primaryVideoTransparent: true } : {}),
  });

  save('composition.json', props);
  console.log(`B-roll: ${props.bRollSegments?.length ?? 0}, Cues: ${props.cues?.length ?? 0}`);
  console.log(
    `Caption: ${props.captionStyle?.fontSize}px ${props.captionStyle?.highlightMode} ${props.captionStyle?.animationStyle ?? ''}`
  );
  console.log(`${G}Done${X}`);
  console.log(`${D}Next: bun run rs render ${outDir}/composition.json${X}`);
}
