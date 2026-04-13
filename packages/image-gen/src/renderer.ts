import path from 'path';
import fs from 'fs';
import type { RenderParams, RenderResult } from './types';
import {
  parseSize,
  validateBrand,
  validateTemplate,
  buildUrl,
  extractContentParams,
  DEFAULT_BRANDS_DIR,
} from './engine';

const ALLOWED_NETWORK_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/**
 * Route filter for SSRF prevention.
 * Only allows file:// and Google Fonts — blocks all other network requests.
 */
function routeFilter(route: import('playwright').Route): void {
  const url = route.request().url();
  if (url.startsWith('file://')) {
    route.continue();
    return;
  }
  try {
    const host = new URL(url).hostname;
    if (ALLOWED_NETWORK_HOSTS.has(host)) {
      route.continue();
      return;
    }
  } catch {
    // ignore parse errors
  }
  route.abort();
}

/**
 * Render a single image. Returns PNG bytes.
 * Launches a new browser per call (suitable for API usage).
 */
export async function renderImage(
  brandCssPath: string,
  template: string,
  width: number,
  height: number,
  params: Record<string, string>
): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const templatePath = validateTemplate(template);
  const brandsDir = path.dirname(brandCssPath);
  const brand = path.basename(brandCssPath, '.css');
  const url = buildUrl(templatePath, brand, brandsDir, params);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', routeFilter);
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
    await page.waitForTimeout(2000);
    const png = await page.screenshot({ type: 'png' });
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}

/**
 * Render multiple sizes in batch, reusing a single browser page.
 * More efficient for rendering the same template at multiple sizes.
 */
export async function renderImages(
  brandCssPath: string,
  template: string,
  sizes: Array<{ name: string; width: number; height: number }>,
  params: Record<string, string>
): Promise<RenderResult[]> {
  const { chromium } = await import('playwright');
  const templatePath = validateTemplate(template);
  const brandsDir = path.dirname(brandCssPath);
  const brand = path.basename(brandCssPath, '.css');
  const url = buildUrl(templatePath, brand, brandsDir, params);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', routeFilter);

    const results: RenderResult[] = [];
    for (const { name, width, height } of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(2000);
      const png = await page.screenshot({ type: 'png' });
      results.push({ sizeName: name, width, height, png: Buffer.from(png) });
    }
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * High-level render from RenderParams. Handles size parsing, brand validation.
 * Returns array of RenderResults (one per size).
 */
export async function render(
  params: RenderParams,
  brandsDir = DEFAULT_BRANDS_DIR
): Promise<RenderResult[]> {
  const brandCssPath = validateBrand(params.brand, brandsDir);
  const sizes = parseSize(params.size);
  const contentParams = extractContentParams(params);

  if (sizes.length === 1) {
    const { name, width, height } = sizes[0]!;
    const png = await renderImage(brandCssPath, params.template, width, height, contentParams);
    return [{ sizeName: name, width, height, png }];
  }

  return renderImages(brandCssPath, params.template, sizes, contentParams);
}

/**
 * Render image and save to file. Returns file size in bytes.
 */
export async function renderToFile(
  params: RenderParams,
  outputPath: string,
  brandsDir = DEFAULT_BRANDS_DIR
): Promise<number> {
  const results = await render(params, brandsDir);
  if (results.length !== 1) {
    throw new Error('renderToFile requires a single size (not "all")');
  }
  const { png } = results[0]!;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, png);
  return png.length;
}
