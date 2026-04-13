/**
 * Branded-image command - Generate branded template images via image-gen.
 *
 * Usage:
 *   bun run rs branded-image --template tip-card --brand techskills --text "Hello"
 *   bun run rs branded-image   (list available templates and brands)
 */
import fs from 'fs';
import path from 'path';
import { B, G, R, Y, D, X, opt } from '../cli-utils';

const PRIVATE_BRANDS_DIR = '/Users/pavvel/workspace/projects/reelstack-modules/src/brands';

export async function brandedImage() {
  const template = opt('template');
  const brand = opt('brand') ?? 'techskills';
  const size = (opt('size') ?? 'post') as string;
  const outputDir = opt('out') ?? '.';

  // Lazy import - use relative path since @reelstack/image-gen is not in agent's dependencies
  const imageGen = await import('../../../image-gen/src/index');

  // No --template: list available templates and brands
  if (!template) {
    const templates = imageGen.listTemplates();

    // Collect brands from built-in + private dirs
    const builtinBrands = imageGen.listBrands(imageGen.DEFAULT_BRANDS_DIR);
    const privateBrands = fs.existsSync(PRIVATE_BRANDS_DIR)
      ? imageGen.listBrands(PRIVATE_BRANDS_DIR)
      : [];

    console.log(`${B}Branded Image Generator${X}

Usage: bun run rs branded-image --template <id> --brand <name> [options]

${Y}Available templates:${X}
  ${templates.join('\n  ')}

${Y}Built-in brands:${X}
  ${builtinBrands.length ? builtinBrands.join(', ') : 'none'}

${privateBrands.length ? `${Y}Private brands:${X}\n  ${privateBrands.join(', ')}\n` : ''}
${Y}Sizes:${X}
  post     1080x1080
  story    1080x1920
  youtube  1280x720
  all      All of the above
  WxH      Custom (e.g. 800x600)

${Y}Content params:${X}
  --text "..."     Main text
  --title "..."    Title/heading
  --attr "..."     Attribution/author
  --badge "..."    Badge label
  --bullets "..."  Bullet points (newline-separated)
  --cta "..."      Call-to-action text
  --date "..."     Date string
  --num "..."      Number highlight
  --label "..."    Label text
  --bg "url"       Background image URL
  --bg_opacity "n" Background opacity (0-1)

${Y}Example:${X}
  bun run rs branded-image --template tip-card --brand techskills --text "Automatyzuj, nie komplikuj" --size post`);
    process.exit(0);
  }

  // Determine brands dir - check private first, then built-in
  let brandsDir = imageGen.DEFAULT_BRANDS_DIR;
  if (fs.existsSync(PRIVATE_BRANDS_DIR)) {
    const privateCss = path.join(PRIVATE_BRANDS_DIR, `${brand}.css`);
    if (fs.existsSync(privateCss)) {
      brandsDir = PRIVATE_BRANDS_DIR;
    }
  }

  console.log(`${B}Branded Image${X}`);
  console.log(`  Template: ${template}, Brand: ${brand}, Size: ${size}`);

  // Build content params from CLI opts
  const contentKeys = [
    'text',
    'attr',
    'title',
    'badge',
    'bullets',
    'number',
    'label',
    'date',
    'cta',
    'num',
    'urgency',
    'bg',
    'bg_opacity',
  ] as const;

  const params: Record<string, string> = {};
  for (const key of contentKeys) {
    const val = opt(key);
    if (val) params[key] = val;
  }

  const t0 = performance.now();

  try {
    if (size === 'all') {
      // Render all sizes
      const results = await imageGen.render({ brand, template, size, ...params }, brandsDir);
      for (const r of results) {
        const outputPath = path.join(outputDir, `${template}-${r.sizeName}.png`);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, r.png);
        console.log(`  ${G}${r.sizeName}${X} (${r.width}x${r.height}): ${outputPath}`);
      }
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`${G}Done${X} (${elapsed}s): ${results.length} images`);
    } else {
      // Render single size
      const filename = opt('filename') ?? `${template}-${size}.png`;
      const outputPath = path.join(outputDir, filename);

      const bytes = await imageGen.renderToFile(
        { brand, template, size, ...params },
        outputPath,
        brandsDir
      );
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      const kb = (bytes / 1024).toFixed(0);
      console.log(`${G}Done${X} (${elapsed}s): ${outputPath} (${kb} KB)`);
      console.log(`${D}Open: open ${outputPath}${X}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`${R}Error: ${msg}${X}`);
    process.exit(1);
  }
}
