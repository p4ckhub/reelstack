/**
 * Replace command - Swap an asset with a user-provided file.
 */
import fs from 'fs';
import path from 'path';
import { B, G, R, D, X, positional, save, outDir, uploadToR2 } from '../cli-utils';

export async function replace() {
  const shotId = positional(1);
  const filePath = positional(2);
  if (!shotId || !filePath) {
    console.log(
      `Usage: bun run rs replace <shot-id> <file>\n\nReplace an asset with your own file (screenshot, screencast, etc.).\nExample: bun run rs replace shot-10 ~/Desktop/my-screenshot.png\n         bun run rs replace shot-5 recording.mp4`
    );
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.log(`${R}File not found: ${filePath}${X}`);
    process.exit(1);
  }

  const assetsFile = path.join(outDir, 'assets.json');
  const planFile = path.join(outDir, 'plan.json');

  if (!fs.existsSync(planFile)) {
    console.log(`${R}No plan.json in ${outDir}. Run 'plan' first.${X}`);
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  const shot = plan.shots.find((s: { id: string }) => s.id === shotId);
  if (!shot) {
    console.log(`${R}Shot "${shotId}" not found in plan.${X}`);
    console.log(`Available: ${plan.shots.map((s: { id: string }) => s.id).join(', ')}`);
    process.exit(1);
  }

  // Copy to assets dir
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const ext = path.extname(filePath);
  const localPath = path.join(assetsDir, `${shotId}${ext}`);
  fs.copyFileSync(filePath, localPath);

  // Detect type from extension
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const isVideo = videoExts.includes(ext.toLowerCase());
  const assetType = isVideo ? 'user-video' : 'user-image';

  console.log(`${B}Replace${X} ${shotId} <- ${path.basename(filePath)} (${assetType})`);

  // Describe with vision
  const { describeAsset } = await import('../planner/asset-describer');
  const description = await describeAsset(filePath);
  console.log(`  ${D}Description: ${description}${X}`);

  // Upload to R2
  const url = await uploadToR2(localPath, 'assets/', `user-${shotId}-${Date.now()}`);

  // Build asset entry
  const asset = {
    toolId: 'user-upload',
    shotId,
    url,
    type: assetType,
    localPath,
    prompt: description,
  };

  // Update assets.json
  let allAssets: Array<Record<string, unknown>> = [];
  if (fs.existsSync(assetsFile)) {
    allAssets = JSON.parse(fs.readFileSync(assetsFile, 'utf-8'));
  }
  const existingIdx = allAssets.findIndex((a) => a.shotId === shotId);
  if (existingIdx >= 0) {
    allAssets[existingIdx] = asset;
  } else {
    allAssets.push(asset);
  }
  save('assets.json', allAssets);

  console.log(`${G}Done${X}: ${shotId} replaced with ${path.basename(filePath)}`);
  console.log(`${D}Next: bun run rs assemble ${outDir}/plan.json ${outDir}/tts.json${X}`);
}
