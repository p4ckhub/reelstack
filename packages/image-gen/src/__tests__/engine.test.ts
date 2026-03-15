import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  SIZES,
  CONTENT_KEYS,
  META_KEYS,
  parseSize,
  validateBrand,
  validateTemplate,
  listTemplates,
  listBrands,
  buildUrl,
} from '../engine';

// ── Fixtures ───────────────────────────────────────────

let brandsDir: string;

beforeAll(() => {
  brandsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gen-test-brands-'));
  fs.writeFileSync(path.join(brandsDir, 'testbrand.css'), ':root { --brand-accent: #ff0000; }');
});

// ── parseSize ─────────────────────────────────────────

describe('parseSize', () => {
  it('post returns 1080x1080', () => {
    const result = parseSize('post');
    expect(result).toEqual([{ name: 'post', width: 1080, height: 1080 }]);
  });

  it('story returns 1080x1920', () => {
    const result = parseSize('story');
    expect(result).toEqual([{ name: 'story', width: 1080, height: 1920 }]);
  });

  it('youtube returns 1280x720', () => {
    const result = parseSize('youtube');
    expect(result).toEqual([{ name: 'youtube', width: 1280, height: 720 }]);
  });

  it('all returns 3 sizes', () => {
    const result = parseSize('all');
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('post');
    expect(names).toContain('story');
    expect(names).toContain('youtube');
  });

  it('custom WxH is parsed correctly', () => {
    const result = parseSize('1200x628');
    expect(result).toEqual([{ name: 'custom', width: 1200, height: 628 }]);
  });

  it('throws on unknown size', () => {
    expect(() => parseSize('banana')).toThrow('Unknown size');
  });

  it('throws on custom size out of range', () => {
    expect(() => parseSize('0x500')).toThrow('must be between');
    expect(() => parseSize('5000x500')).toThrow('must be between');
  });
});

// ── validateBrand ──────────────────────────────────────

describe('validateBrand', () => {
  it('returns path for existing brand', () => {
    const result = validateBrand('testbrand', brandsDir);
    expect(result).toContain('testbrand.css');
    expect(fs.existsSync(result)).toBe(true);
  });

  it('throws for missing brand', () => {
    expect(() => validateBrand('nonexistent', brandsDir)).toThrow('not found');
  });

  it('error message lists available brands', () => {
    expect(() => validateBrand('missing', brandsDir)).toThrow('testbrand');
  });
});

// ── validateTemplate ───────────────────────────────────

describe('validateTemplate', () => {
  it('returns path for existing template', () => {
    const result = validateTemplate('quote-card');
    expect(result).toContain('quote-card.html');
    expect(fs.existsSync(result)).toBe(true);
  });

  it('throws for missing template', () => {
    expect(() => validateTemplate('nonexistent-template')).toThrow('not found');
  });

  it('error message does not list _base', () => {
    try {
      validateTemplate('no-such-template');
    } catch (e: unknown) {
      expect((e as Error).message).not.toContain('_base');
    }
  });
});

// ── listTemplates ──────────────────────────────────────

describe('listTemplates', () => {
  it('contains expected templates', () => {
    const templates = listTemplates();
    expect(templates).toContain('quote-card');
    expect(templates).toContain('tip-card');
    expect(templates).toContain('ad-card');
    expect(templates).toContain('announcement');
  });

  it('excludes underscore-prefixed files', () => {
    const templates = listTemplates();
    expect(templates).not.toContain('_base');
  });
});

// ── listBrands ─────────────────────────────────────────

describe('listBrands', () => {
  it('contains testbrand', () => {
    const brands = listBrands(brandsDir);
    expect(brands).toContain('testbrand');
  });

  it('excludes underscore-prefixed files', () => {
    fs.writeFileSync(path.join(brandsDir, '_hidden.css'), ':root {}');
    const brands = listBrands(brandsDir);
    expect(brands).not.toContain('_hidden');
  });

  it('returns empty array for empty dir', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gen-test-empty-'));
    expect(listBrands(emptyDir)).toEqual([]);
  });

  it('returns empty array for nonexistent dir', () => {
    expect(listBrands('/nonexistent/path/brands')).toEqual([]);
  });
});

// ── buildUrl ───────────────────────────────────────────

describe('buildUrl', () => {
  it('builds correct file:// URL', () => {
    const url = buildUrl('/app/templates/quote-card.html', 'testbrand', brandsDir, { text: 'Hello world' });
    expect(url).toMatch(/^file:\/\/\/app\/templates\/quote-card\.html\?/);
    expect(url).toContain('brand=testbrand');
    expect(url).toContain('text=');
  });

  it('encodes special characters', () => {
    const url = buildUrl('/app/templates/quote-card.html', 'testbrand', brandsDir, { text: 'Hello & goodbye' });
    // Should be URL-encoded, not raw ampersand in value
    expect(url).not.toMatch(/text=Hello & goodbye/);
  });
});

// ── Constants ──────────────────────────────────────────

describe('SIZES', () => {
  it('contains all presets', () => {
    expect(SIZES['post']).toEqual([1080, 1080]);
    expect(SIZES['story']).toEqual([1080, 1920]);
    expect(SIZES['youtube']).toEqual([1280, 720]);
  });
});

describe('CONTENT_KEYS', () => {
  it('contains expected keys', () => {
    expect(CONTENT_KEYS).toContain('text');
    expect(CONTENT_KEYS).toContain('attr');
    expect(CONTENT_KEYS).toContain('title');
    expect(CONTENT_KEYS).toContain('cta');
    expect(CONTENT_KEYS).toContain('badge');
    expect(CONTENT_KEYS).toContain('bullets');
  });
});

describe('META_KEYS', () => {
  it('contains expected keys', () => {
    expect(META_KEYS.has('brand')).toBe(true);
    expect(META_KEYS.has('template')).toBe(true);
    expect(META_KEYS.has('size')).toBe(true);
  });
});
