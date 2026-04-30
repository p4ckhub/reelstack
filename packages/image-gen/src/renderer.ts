import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import type { RenderParams, RenderResult } from './types';
import {
  parseSize,
  validateBrand,
  validateTemplate,
  buildUrl,
  extractContentParams,
  DEFAULT_BRANDS_DIR,
  TEMPLATES_DIR,
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
 * Inline _base.css, _base.js and the template's own JS into the HTML.
 * Lets templates live in external pack dirs without needing their own copy of _base.*.
 * Returns a path to a temp HTML file ready to be loaded via file://.
 */
function prepareTemplateFile(templatePath: string): string {
  const templateDir = path.dirname(templatePath);
  const templateName = path.basename(templatePath, '.html');

  const html = fs.readFileSync(templatePath, 'utf-8');
  const baseCss = fs.readFileSync(path.join(TEMPLATES_DIR, '_base.css'), 'utf-8');
  const baseJs = fs.readFileSync(path.join(TEMPLATES_DIR, '_base.js'), 'utf-8');

  const templateJsPath = path.join(templateDir, `${templateName}.js`);
  const templateJs = fs.existsSync(templateJsPath) ? fs.readFileSync(templateJsPath, 'utf-8') : '';

  // Inlined JS may legitimately contain the literal sequence "</script>"
  // (in comments or strings). Browsers terminate the script block at the
  // first one and dump the rest as text. Escape the slash so the HTML
  // parser does not see a closing tag, while JS still reads it correctly.
  const escapeForScript = (js: string) => js.replace(/<\/script>/gi, '<\\/script>');
  const escapeForStyle = (css: string) => css.replace(/<\/style>/gi, '<\\/style>');

  const inlined = html
    .replace(
      '<link rel="stylesheet" href="_base.css">',
      `<style>${escapeForStyle(baseCss)}</style>`
    )
    .replace('<script src="_base.js"></script>', `<script>${escapeForScript(baseJs)}</script>`)
    .replace(
      `<script src="${templateName}.js"></script>`,
      templateJs ? `<script>${escapeForScript(templateJs)}</script>` : ''
    );

  const tmpFile = path.join(os.tmpdir(), `image-gen-${randomUUID()}.html`);
  fs.writeFileSync(tmpFile, inlined);
  return tmpFile;
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
  params: Record<string, string>,
  templatesDirs: string[] = []
): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const templatePath = validateTemplate(template, templatesDirs);
  const brandsDir = path.dirname(brandCssPath);
  const brand = path.basename(brandCssPath, '.css');

  const tmpFile = prepareTemplateFile(templatePath);
  try {
    const url = buildUrl(tmpFile, brand, brandsDir, params);
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
  } finally {
    fs.rmSync(tmpFile, { force: true });
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
  params: Record<string, string>,
  templatesDirs: string[] = []
): Promise<RenderResult[]> {
  const { chromium } = await import('playwright');
  const templatePath = validateTemplate(template, templatesDirs);
  const brandsDir = path.dirname(brandCssPath);
  const brand = path.basename(brandCssPath, '.css');

  const tmpFile = prepareTemplateFile(templatePath);
  try {
    const url = buildUrl(tmpFile, brand, brandsDir, params);
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
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

/**
 * High-level render from RenderParams. Handles size parsing, brand validation.
 * Returns array of RenderResults (one per size).
 *
 * @param templatesDir Optional external templates directory (e.g. a private pack).
 *   Searched before core templates when resolving the template name.
 */
export async function render(
  params: RenderParams,
  brandsDir = DEFAULT_BRANDS_DIR,
  templatesDir?: string
): Promise<RenderResult[]> {
  const brandCssPath = validateBrand(params.brand, brandsDir);
  const sizes = parseSize(params.size);
  const contentParams = extractContentParams(params);
  const externalDirs = templatesDir ? [templatesDir] : [];

  if (sizes.length === 1) {
    const { name, width, height } = sizes[0]!;
    const png = await renderImage(
      brandCssPath,
      params.template,
      width,
      height,
      contentParams,
      externalDirs
    );
    return [{ sizeName: name, width, height, png }];
  }

  return renderImages(brandCssPath, params.template, sizes, contentParams, externalDirs);
}

/**
 * Render image and save to file. Returns file size in bytes.
 */
export async function renderToFile(
  params: RenderParams,
  outputPath: string,
  brandsDir = DEFAULT_BRANDS_DIR,
  templatesDir?: string
): Promise<number> {
  const results = await render(params, brandsDir, templatesDir);
  if (results.length !== 1) {
    throw new Error('renderToFile requires a single size (not "all")');
  }
  const { png } = results[0]!;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, png);
  return png.length;
}
