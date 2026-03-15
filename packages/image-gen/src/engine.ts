import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { SizeSpec, RenderParams } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = path.resolve(__dirname, '..');
export const TEMPLATES_DIR = path.resolve(PACKAGE_DIR, 'templates');
export const DEFAULT_BRANDS_DIR = path.resolve(PACKAGE_DIR, 'brands');

export const SIZES: Record<string, [number, number]> = {
  post:    [1080, 1080],
  story:   [1080, 1920],
  youtube: [1280, 720],
};

export const CONTENT_KEYS = [
  'text', 'attr', 'title', 'badge', 'bullets', 'number',
  'label', 'date', 'cta', 'num', 'urgency', 'bg_opacity',
] as const;

export const META_KEYS = new Set(['brand', 'template', 'size', 'output_prefix', 'output_dir', 'brands_dir']);

/**
 * Parse size string into list of SizeSpecs.
 * Supports: 'post' | 'story' | 'youtube' | 'all' | 'WxH'
 */
export function parseSize(sizeStr: string): SizeSpec[] {
  if (sizeStr === 'all') {
    return Object.entries(SIZES).map(([name, [width, height]]) => ({ name, width, height }));
  }
  if (sizeStr in SIZES) {
    const [width, height] = SIZES[sizeStr]!;
    return [{ name: sizeStr, width, height }];
  }
  if (sizeStr.includes('x')) {
    const [wStr, hStr] = sizeStr.split('x');
    const width = parseInt(wStr!, 10);
    const height = parseInt(hStr!, 10);
    if (isNaN(width) || isNaN(height) || width < 1 || width > 4096 || height < 1 || height > 4096) {
      throw new Error('Custom size must be between 1x1 and 4096x4096');
    }
    return [{ name: 'custom', width, height }];
  }
  throw new Error(`Unknown size '${sizeStr}'. Use: ${Object.keys(SIZES).join(', ')}, all, or WxH`);
}

/**
 * Check brand CSS file exists, return its path.
 */
export function validateBrand(brand: string, brandsDir: string): string {
  const brandPath = path.join(brandsDir, `${brand}.css`);
  if (!fs.existsSync(brandPath)) {
    const available = fs.readdirSync(brandsDir)
      .filter(f => f.endsWith('.css') && !f.startsWith('_'))
      .map(f => f.replace('.css', ''))
      .sort();
    throw new Error(
      `Brand '${brand}' not found. Available: ${available.length ? available.join(', ') : 'none'}`,
    );
  }
  return brandPath;
}

/**
 * Check template HTML file exists, return its path.
 */
export function validateTemplate(template: string, templatesDir = TEMPLATES_DIR): string {
  const templatePath = path.join(templatesDir, `${template}.html`);
  if (!fs.existsSync(templatePath)) {
    const available = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith('.html') && !f.startsWith('_'))
      .map(f => f.replace('.html', ''))
      .sort();
    throw new Error(`Template '${template}' not found. Available: ${available.join(', ')}`);
  }
  return templatePath;
}

/**
 * Return list of available template names.
 */
export function listTemplates(templatesDir = TEMPLATES_DIR): string[] {
  return fs.readdirSync(templatesDir)
    .filter(f => f.endsWith('.html') && !f.startsWith('_'))
    .map(f => f.replace('.html', ''))
    .sort();
}

/**
 * Return list of available brand names in a directory.
 */
export function listBrands(brandsDir: string): string[] {
  if (!fs.existsSync(brandsDir)) return [];
  return fs.readdirSync(brandsDir)
    .filter(f => f.endsWith('.css') && !f.startsWith('_'))
    .map(f => f.replace('.css', ''))
    .sort();
}

/**
 * Build file:// URL with brand path and content params.
 */
export function buildUrl(templatePath: string, brand: string, brandsDir: string, params: Record<string, string>): string {
  const query = new URLSearchParams({ brand, brands_dir: brandsDir, ...params });
  return `file://${templatePath}?${query.toString()}`;
}

/**
 * Extract content params from RenderParams (excludes meta keys).
 */
export function extractContentParams(params: RenderParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of CONTENT_KEYS) {
    const value = params[key as keyof RenderParams];
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  if (params.bg) result['bg'] = params.bg;
  return result;
}
