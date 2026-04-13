/**
 * Render command - Render composition to MP4 via Remotion.
 */
import fs from 'fs';
import path from 'path';
import { B, G, Y, D, X, positional, elapsed, outDir } from '../cli-utils';

export async function render() {
  const compFile = positional(1);
  if (!compFile || !fs.existsSync(compFile)) {
    console.log(`Usage: bun run rs render <composition.json>`);
    process.exit(1);
  }

  const { renderVideo } = await import('../orchestrator/base-orchestrator');
  const props = JSON.parse(fs.readFileSync(compFile, 'utf-8'));
  const outputPath = path.join(outDir, 'output.mp4');

  console.log(`${B}Remotion Render${X}`);
  console.log(`${Y}First run bundles Remotion (~60s). Subsequent runs are fast.${X}`);

  const t0 = performance.now();
  const result = await renderVideo(props, outputPath, (msg) => console.log(`  ${D}${msg}${X}`));

  console.log(`${G}Done${X} (${elapsed(t0)}): ${result.outputPath}`);
  console.log(`${D}Open: open ${result.outputPath}${X}`);
}
