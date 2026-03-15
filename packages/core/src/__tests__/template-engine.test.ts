import { describe, it, expect } from 'vitest';
import {
  TemplateEngine,
  sanitizeStyle,
  BUILT_IN_TEMPLATES,
  ALLOWED_FONT_FAMILIES,
} from '../engines/template-engine';
import { DEFAULT_SUBTITLE_STYLE } from '@reelstack/types';
import type { SubtitleStyle, SubtitleTemplate } from '@reelstack/types';

describe('sanitizeStyle', () => {
  it('returns defaults when given an empty partial', () => {
    const result = sanitizeStyle({});
    expect(result).toEqual(DEFAULT_SUBTITLE_STYLE);
  });

  it('applies valid overrides', () => {
    const result = sanitizeStyle({ fontSize: 40, fontWeight: 'bold', alignment: 'right' });
    expect(result.fontSize).toBe(40);
    expect(result.fontWeight).toBe('bold');
    expect(result.alignment).toBe('right');
  });

  // CSS injection prevention
  it('rejects expression() in color value', () => {
    const result = sanitizeStyle({ fontColor: 'expression(alert(1))' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  it('rejects url() in color value', () => {
    const result = sanitizeStyle({ fontColor: 'url(evil.com)' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  it('rejects @import in color value', () => {
    const result = sanitizeStyle({ fontColor: '@import "evil.css"' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  it('rejects javascript: in color value', () => {
    const result = sanitizeStyle({ fontColor: 'javascript:alert(1)' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  it('rejects values with semicolons or braces', () => {
    const result = sanitizeStyle({ fontColor: '#FFF; background: red' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  it('rejects -moz-binding in color value', () => {
    const result = sanitizeStyle({ outlineColor: '-moz-binding:url(x)' });
    expect(result.outlineColor).toBe(DEFAULT_SUBTITLE_STYLE.outlineColor);
  });

  it('rejects behavior: in color value', () => {
    const result = sanitizeStyle({ shadowColor: 'behavior:url(x)' });
    expect(result.shadowColor).toBe(DEFAULT_SUBTITLE_STYLE.shadowColor);
  });

  // Font family whitelist
  it('accepts whitelisted font families', () => {
    for (const font of ALLOWED_FONT_FAMILIES) {
      const result = sanitizeStyle({ fontFamily: font });
      expect(result.fontFamily).toBe(font);
    }
  });

  it('rejects non-whitelisted font family', () => {
    const result = sanitizeStyle({ fontFamily: 'Comic Sans MS' });
    expect(result.fontFamily).toBe(DEFAULT_SUBTITLE_STYLE.fontFamily);
  });

  // Hex color validation
  it('accepts valid 3-digit hex color', () => {
    const result = sanitizeStyle({ fontColor: '#FFF' });
    expect(result.fontColor).toBe('#FFF');
  });

  it('accepts valid 6-digit hex color', () => {
    const result = sanitizeStyle({ fontColor: '#FF00AA' });
    expect(result.fontColor).toBe('#FF00AA');
  });

  it('accepts valid 8-digit hex color (with alpha)', () => {
    const result = sanitizeStyle({ fontColor: '#FF00AACC' });
    expect(result.fontColor).toBe('#FF00AACC');
  });

  it('rejects invalid hex color', () => {
    const result = sanitizeStyle({ fontColor: 'red' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  it('rejects hex color without hash', () => {
    const result = sanitizeStyle({ fontColor: 'FFFFFF' });
    expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
  });

  // Numeric clamping
  it('clamps fontSize to min 8', () => {
    const result = sanitizeStyle({ fontSize: 2 });
    expect(result.fontSize).toBe(8);
  });

  it('clamps fontSize to max 120', () => {
    const result = sanitizeStyle({ fontSize: 200 });
    expect(result.fontSize).toBe(120);
  });

  it('clamps backgroundOpacity to [0, 1]', () => {
    expect(sanitizeStyle({ backgroundOpacity: -0.5 }).backgroundOpacity).toBe(0);
    expect(sanitizeStyle({ backgroundOpacity: 1.5 }).backgroundOpacity).toBe(1);
  });

  it('clamps position to [0, 100]', () => {
    expect(sanitizeStyle({ position: -10 }).position).toBe(0);
    expect(sanitizeStyle({ position: 150 }).position).toBe(100);
  });

  // fontWeight / fontStyle
  it('defaults fontWeight to normal for invalid values', () => {
    const result = sanitizeStyle({ fontWeight: 'bolder' as any });
    expect(result.fontWeight).toBe('normal');
  });

  it('defaults fontStyle to normal for invalid values', () => {
    const result = sanitizeStyle({ fontStyle: 'oblique' as any });
    expect(result.fontStyle).toBe('normal');
  });

  // alignment
  it('defaults alignment for invalid values', () => {
    const result = sanitizeStyle({ alignment: 'justify' as any });
    expect(result.alignment).toBe(DEFAULT_SUBTITLE_STYLE.alignment);
  });
});

describe('TemplateEngine', () => {
  const engine = new TemplateEngine();

  describe('applyTemplate', () => {
    it('returns sanitized style from a built-in template', () => {
      const template = BUILT_IN_TEMPLATES[0]!;
      const style = engine.applyTemplate(template);
      expect(style.fontFamily).toBe(template.style.fontFamily);
      expect(style.fontSize).toBe(template.style.fontSize);
    });
  });

  describe('mergeStyleOverrides', () => {
    it('merges base style with overrides and sanitizes', () => {
      const base = DEFAULT_SUBTITLE_STYLE;
      const result = engine.mergeStyleOverrides(base, { fontSize: 48, fontWeight: 'bold' });
      expect(result.fontSize).toBe(48);
      expect(result.fontWeight).toBe('bold');
      // unmodified fields remain
      expect(result.fontFamily).toBe(base.fontFamily);
    });

    it('sanitizes invalid overrides during merge', () => {
      const base = DEFAULT_SUBTITLE_STYLE;
      const result = engine.mergeStyleOverrides(base, { fontColor: 'not-a-color', fontSize: 999 });
      expect(result.fontColor).toBe(DEFAULT_SUBTITLE_STYLE.fontColor);
      expect(result.fontSize).toBe(120); // clamped
    });
  });

  describe('getTemplateById', () => {
    it('finds a built-in template by id', () => {
      const template = engine.getTemplateById([], 'builtin-classic');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Classic');
    });

    it('finds a custom template from the provided array', () => {
      const custom: SubtitleTemplate = {
        id: 'custom-1',
        name: 'Custom',
        description: '',
        style: DEFAULT_SUBTITLE_STYLE,
        category: 'custom',
        isBuiltIn: false,
        isPublic: false,
        usageCount: 0,
        createdAt: '',
        updatedAt: '',
      };
      const result = engine.getTemplateById([custom], 'custom-1');
      expect(result).toBe(custom);
    });

    it('returns undefined for non-existent template ID', () => {
      const result = engine.getTemplateById([], 'non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('createTemplate', () => {
    it('creates a new template with sanitized style', () => {
      const template = engine.createTemplate('My Template', { fontSize: 50 });
      expect(template.name).toBe('My Template');
      expect(template.style.fontSize).toBe(50);
      expect(template.isBuiltIn).toBe(false);
      expect(template.id).toBeTruthy();
    });

    it('truncates name to 100 chars', () => {
      const longName = 'A'.repeat(200);
      const template = engine.createTemplate(longName, {});
      expect(template.name.length).toBe(100);
    });

    it('truncates description to 500 chars', () => {
      const longDesc = 'B'.repeat(600);
      const template = engine.createTemplate('Test', {}, { description: longDesc });
      expect(template.description.length).toBe(500);
    });
  });

  describe('updateTemplate', () => {
    it('updates a custom template', () => {
      const custom: SubtitleTemplate = {
        id: 'custom-1',
        name: 'Old Name',
        description: '',
        style: DEFAULT_SUBTITLE_STYLE,
        category: 'custom',
        isBuiltIn: false,
        isPublic: false,
        usageCount: 0,
        createdAt: '',
        updatedAt: '',
      };
      const result = engine.updateTemplate([custom], 'custom-1', { name: 'New Name' });
      expect(result[0]!.name).toBe('New Name');
    });

    it('does not update built-in templates', () => {
      const builtIn = BUILT_IN_TEMPLATES[0]!;
      const result = engine.updateTemplate([builtIn], builtIn.id, { name: 'Hacked' });
      expect(result[0]!.name).toBe(builtIn.name);
    });
  });

  describe('removeTemplate', () => {
    it('removes a custom template', () => {
      const custom: SubtitleTemplate = {
        id: 'custom-1',
        name: 'To Remove',
        description: '',
        style: DEFAULT_SUBTITLE_STYLE,
        category: 'custom',
        isBuiltIn: false,
        isPublic: false,
        usageCount: 0,
        createdAt: '',
        updatedAt: '',
      };
      const result = engine.removeTemplate([custom], 'custom-1');
      expect(result).toHaveLength(0);
    });

    it('does not remove built-in templates', () => {
      const builtIn = BUILT_IN_TEMPLATES[0]!;
      const result = engine.removeTemplate([builtIn], builtIn.id);
      expect(result).toHaveLength(1);
    });
  });
});
