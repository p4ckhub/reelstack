/**
 * Assets command - Generate images/videos for b-roll shots in a plan.
 */
import fs from 'fs';
import path from 'path';
import {
  B,
  G,
  Y,
  D,
  X,
  positional,
  save,
  elapsed,
  outDir,
  setupRegistry,
  uploadToR2,
} from '../cli-utils';

export async function assets() {
  const planFile = positional(1);
  if (!planFile || !fs.existsSync(planFile)) {
    console.log(
      `Usage: bun run rs assets <plan.json>\n\nGenerates images/videos for all b-roll shots in the plan.\nRequires API keys for video/image tools (fal.ai, Kling, etc.).`
    );
    process.exit(1);
  }

  const { generateAssets } = await import('../orchestrator/asset-generator');

  const registry = await setupRegistry();
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));

  console.log(`${B}Asset Generation${X}`);
  const t0 = performance.now();

  // Count shots that need assets
  const brollShots = plan.shots.filter(
    (s: { visual?: { type?: string } }) =>
      s.visual?.type === 'b-roll' || s.visual?.type === 'ai-video' || s.visual?.type === 'ai-image'
  );
  console.log(`  ${D}${brollShots.length} shots need assets${X}`);

  // Generate
  const generated = await generateAssets(plan, registry, (msg) => console.log(`  ${D}${msg}${X}`));

  // Copy assets to out/assets/ and enrich with prompts from plan
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const asset of generated) {
    // Copy local file to out/assets/
    if (asset.url && !asset.url.startsWith('http') && fs.existsSync(asset.url)) {
      const ext = path.extname(asset.url) || '.mp4';
      const localPath = path.join(assetsDir, `${asset.shotId}${ext}`);
      fs.copyFileSync(asset.url, localPath);
      (asset as unknown as Record<string, unknown>).localPath = localPath;
    }

    // Enrich with prompt from plan
    const shot = plan.shots.find((s: { id: string }) => s.id === asset.shotId);
    if (shot?.visual?.prompt) {
      (asset as unknown as Record<string, unknown>).prompt = shot.visual.prompt;
    }
  }

  // Upload to R2 (Lambda needs remote URLs)
  console.log(`  ${D}Uploading ${generated.length} assets to R2...${X}`);

  for (const asset of generated) {
    const localFile =
      ((asset as unknown as Record<string, unknown>).localPath as string) ?? asset.url;
    if (localFile && !localFile.startsWith('http') && fs.existsSync(localFile)) {
      try {
        (asset as unknown as { url: string }).url = await uploadToR2(
          localFile,
          'assets/',
          `${asset.shotId}-${Date.now()}`
        );
      } catch (err) {
        console.log(`  ${Y}  ${asset.shotId}: upload failed (${(err as Error).message})${X}`);
      }
    }
  }

  // Save asset map with prompts + local paths + R2 URLs
  save('assets.json', generated);

  const ok = generated.filter((a) => a.url?.startsWith('http')).length;
  console.log(`${G}Done${X} (${elapsed(t0)}): ${ok}/${generated.length} assets uploaded`);
  console.log(`${D}Local copies: ${assetsDir}/${X}`);
  console.log(`${D}Next: bun run rs assemble ${outDir}/plan.json ${outDir}/tts.json${X}`);
}
