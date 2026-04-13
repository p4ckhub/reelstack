/**
 * Image command - Standalone AI image generation via tool registry.
 *
 * Usage:
 *   bun run rs image "prompt text" [--tool nanobanana2-kie] [--aspect 9:16] [--out filename.png]
 */
import fs from 'fs';
import path from 'path';
import { B, G, R, D, X, positional, opt, outDir, setupRegistry, downloadFile } from '../cli-utils';

export async function image() {
  const prompt = positional(1);
  if (!prompt) {
    console.log(
      `Usage: bun run rs image "prompt text" [--tool nanobanana2-kie] [--aspect 9:16] [--filename output.png]

Standalone AI image generation using the tool registry.

Options:
  --tool <id>        Tool ID (default: nanobanana2-kie)
  --aspect <ratio>   Aspect ratio (default: 1:1). Common: 1:1, 9:16, 16:9
  --filename <name>  Output filename (default: image.png)
  --out <dir>        Output directory (default: project out/)`
    );
    process.exit(1);
  }

  const toolId = opt('tool') ?? 'nanobanana2-kie';
  const aspectRatio = (opt('aspect') ?? '1:1') as '9:16' | '16:9' | '1:1';
  const filename = opt('filename') ?? 'image.png';

  console.log(`${B}AI Image Generation${X}`);
  console.log(`  Prompt: "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
  console.log(`  Tool: ${toolId}, Aspect: ${aspectRatio}`);

  const registry = await setupRegistry();
  const tool = registry.get(toolId);

  if (!tool) {
    console.log(`${R}Tool "${toolId}" not available.${X}`);
    const available = registry
      .getAvailable()
      .filter((t) => t.capabilities?.some((c) => c.assetType === 'ai-image'))
      .map((t) => t.id);
    if (available.length > 0) {
      console.log(`${D}Available image tools: ${available.join(', ')}${X}`);
    } else {
      console.log(`${D}No image tools available. Check API keys.${X}`);
    }
    process.exit(1);
  }

  const t0 = performance.now();
  const result = await tool.generate({
    purpose: 'CLI image generation',
    prompt,
    aspectRatio,
  });

  if (result.status === 'failed') {
    console.log(`${R}Generation failed: ${result.error}${X}`);
    process.exit(1);
  }

  // If async tool, poll for result
  if (result.status === 'pending' && result.jobId && tool.poll) {
    console.log(`  ${D}Polling (${result.jobId})...${X}`);
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const poll = await tool.poll(result.jobId);
      if (poll.status === 'completed') {
        const outputPath = path.join(outDir, filename);
        if (poll.url) {
          const ok = await downloadFile(poll.url, outputPath);
          if (ok) {
            const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
            console.log(`${G}Done${X} (${elapsed}s): ${outputPath}`);
            console.log(`${D}Open: open ${outputPath}${X}`);
          } else {
            console.log(`${G}Done${X}: URL = ${poll.url}`);
            console.log(`${R}Download failed.${X}`);
          }
        }
        return;
      }
      if (poll.status === 'failed') {
        console.log(`${R}Failed: ${poll.error}${X}`);
        process.exit(1);
      }
      if (((i + 1) * 5) % 30 === 0) console.log(`  ${D}${(i + 1) * 5}s...${X}`);
    }
    console.log(`${R}Timeout after 5 minutes.${X}`);
    process.exit(1);
  }

  // Synchronous result with URL
  if (result.url) {
    const outputPath = path.join(outDir, filename);
    const ok = await downloadFile(result.url, outputPath);
    if (ok) {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`${G}Done${X} (${elapsed}s): ${outputPath}`);
      console.log(`${D}Open: open ${outputPath}${X}`);
    } else {
      console.log(`${G}Done${X}: URL = ${result.url}`);
      console.log(`${R}Download failed.${X}`);
    }
  }
}
