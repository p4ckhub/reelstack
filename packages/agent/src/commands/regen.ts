/**
 * Regen command - Regenerate a single asset from a plan.
 */
import fs from 'fs';
import path from 'path';
import {
  B,
  G,
  R,
  D,
  X,
  positional,
  opt,
  save,
  elapsed,
  outDir,
  setupRegistry,
  uploadToR2,
} from '../cli-utils';

export async function regen() {
  const shotId = positional(1);
  if (!shotId) {
    console.log(
      `Usage: bun run rs regen <shot-id> [--prompt "new prompt"] [--tool <tool-id>]\n\nRegenerates one asset, updates assets.json, re-uploads to R2.\nExample: bun run rs regen shot-10 --prompt "person discussing food allergies at restaurant table"`
    );
    process.exit(1);
  }

  const planFile = path.join(outDir, 'plan.json');
  const assetsFile = path.join(outDir, 'assets.json');
  if (!fs.existsSync(planFile)) {
    console.log(`${R}No plan.json in ${outDir}. Run 'plan' first.${X}`);
    process.exit(1);
  }

  const { regenerateAsset } = await import('../orchestrator/asset-generator');

  const registry = await setupRegistry();
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  const shot = plan.shots.find((s: { id: string }) => s.id === shotId);
  if (!shot) {
    console.log(`${R}Shot "${shotId}" not found in plan.${X}`);
    console.log(`Available: ${plan.shots.map((s: { id: string }) => s.id).join(', ')}`);
    process.exit(1);
  }

  const newPrompt = opt('prompt');
  const newTool = opt('tool');

  console.log(`${B}Regen${X} ${shotId}`);
  console.log(`  Type: ${shot.visual.type}, Tool: ${shot.visual.toolId ?? '-'}`);
  if (newPrompt) console.log(`  New prompt: "${newPrompt.substring(0, 80)}..."`);
  if (newTool) console.log(`  New tool: ${newTool}`);

  const t0 = performance.now();
  const asset = await regenerateAsset(plan, shotId, registry, {
    prompt: newPrompt,
    toolId: newTool,
  });

  if (!asset) {
    console.log(`${R}Generation failed${X}`);
    process.exit(1);
  }

  // Copy to local assets dir
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  if (asset.url && !asset.url.startsWith('http') && fs.existsSync(asset.url)) {
    const ext = path.extname(asset.url) || '.mp4';
    const localPath = path.join(assetsDir, `${shotId}${ext}`);
    fs.copyFileSync(asset.url, localPath);
    (asset as unknown as Record<string, unknown>).localPath = localPath;
  }

  // Upload to R2
  const localFile =
    ((asset as unknown as Record<string, unknown>).localPath as string) ?? asset.url;
  if (localFile && !localFile.startsWith('http') && fs.existsSync(localFile)) {
    (asset as unknown as { url: string }).url = await uploadToR2(
      localFile,
      'assets/',
      `${shotId}-${Date.now()}`
    );
  }

  // Enrich with prompt
  if (shot.visual?.prompt) {
    (asset as unknown as Record<string, unknown>).prompt = newPrompt ?? shot.visual.prompt;
  }

  // Update assets.json - replace existing entry or add new one
  let allAssets: Array<Record<string, unknown>> = [];
  if (fs.existsSync(assetsFile)) {
    allAssets = JSON.parse(fs.readFileSync(assetsFile, 'utf-8'));
  }
  const existingIdx = allAssets.findIndex((a) => a.shotId === shotId);
  if (existingIdx >= 0) {
    allAssets[existingIdx] = asset as unknown as Record<string, unknown>;
  } else {
    allAssets.push(asset as unknown as Record<string, unknown>);
  }
  save('assets.json', allAssets);

  console.log(`${G}Done${X} (${elapsed(t0)}): ${asset.url?.substring(0, 60)}...`);
  console.log(
    `${D}Local: ${(asset as unknown as Record<string, unknown>).localPath ?? asset.url}${X}`
  );
  console.log(`${D}Next: bun run rs assemble ${outDir}/plan.json ${outDir}/tts.json${X}`);
}
