import type { SubtitleStyle, SubtitleTemplate, TemplateCategory } from '@reelstack/types';
import { DEFAULT_SUBTITLE_STYLE } from '@reelstack/types';

/** Dangerous CSS patterns (security checklist: CSS/style injection) */
const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/i,
  /url\s*\(/i,
  /@import/i,
  /-moz-binding/i,
  /behavior\s*:/i,
  /javascript\s*:/i,
  /\\u[0-9a-f]/i,
  /[;{}]/,
];

const ALLOWED_FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Inter',
  'Outfit',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Lato',
  'Oswald',
  'Poppins',
  'Source Sans Pro',
  'Noto Sans',
  'Ubuntu',
] as const;

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Validate a hex color string */
function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

/** Check a string value for dangerous CSS patterns */
function hasDangerousCss(value: string): boolean {
  return DANGEROUS_CSS_PATTERNS.some((pattern) => pattern.test(value));
}

/** Validate and sanitize a SubtitleStyle, returning a clean copy */
export function sanitizeStyle(style: Partial<SubtitleStyle>): SubtitleStyle {
  const base = DEFAULT_SUBTITLE_STYLE;

  const fontFamily =
    style.fontFamily && ALLOWED_FONT_FAMILIES.includes(style.fontFamily as any)
      ? style.fontFamily
      : base.fontFamily;

  const fontColor =
    style.fontColor && isValidHexColor(style.fontColor) && !hasDangerousCss(style.fontColor)
      ? style.fontColor
      : base.fontColor;

  const backgroundColor =
    style.backgroundColor &&
    isValidHexColor(style.backgroundColor) &&
    !hasDangerousCss(style.backgroundColor)
      ? style.backgroundColor
      : base.backgroundColor;

  const outlineColor =
    style.outlineColor &&
    isValidHexColor(style.outlineColor) &&
    !hasDangerousCss(style.outlineColor)
      ? style.outlineColor
      : base.outlineColor;

  const shadowColor =
    style.shadowColor &&
    isValidHexColor(style.shadowColor) &&
    !hasDangerousCss(style.shadowColor)
      ? style.shadowColor
      : base.shadowColor;

  return {
    fontFamily,
    fontSize: clamp(style.fontSize ?? base.fontSize, 8, 120),
    fontColor,
    fontWeight: style.fontWeight === 'bold' ? 'bold' : 'normal',
    fontStyle: style.fontStyle === 'italic' ? 'italic' : 'normal',
    backgroundColor,
    backgroundOpacity: clamp(style.backgroundOpacity ?? base.backgroundOpacity, 0, 1),
    outlineColor,
    outlineWidth: clamp(style.outlineWidth ?? base.outlineWidth, 0, 20),
    shadowColor,
    shadowBlur: clamp(style.shadowBlur ?? base.shadowBlur, 0, 50),
    position: clamp(style.position ?? base.position, 0, 100),
    alignment: ['left', 'center', 'right'].includes(style.alignment ?? '')
      ? (style.alignment as SubtitleStyle['alignment'])
      : base.alignment,
    lineHeight: clamp(style.lineHeight ?? base.lineHeight, 0.8, 3),
    padding: clamp(style.padding ?? base.padding, 0, 50),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ==========================================
// Built-in template presets
// ==========================================

function makeBuiltIn(
  id: string,
  name: string,
  description: string,
  category: TemplateCategory,
  overrides: Partial<SubtitleStyle>
): SubtitleTemplate {
  return {
    id,
    name,
    description,
    style: { ...DEFAULT_SUBTITLE_STYLE, ...overrides },
    category,
    isBuiltIn: true,
    isPublic: true,
    usageCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

export const BUILT_IN_TEMPLATES: readonly SubtitleTemplate[] = [
  makeBuiltIn('builtin-classic', 'Classic', 'White text with black outline', 'minimal', {
    fontFamily: 'Arial',
    fontSize: 24,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 2,
    backgroundColor: '#000000',
    backgroundOpacity: 0,
  }),
  makeBuiltIn('builtin-cinematic', 'Cinematic', 'Large bold text with shadow', 'cinematic', {
    fontFamily: 'Montserrat',
    fontSize: 32,
    fontWeight: 'bold',
    fontColor: '#FFFFFF',
    outlineWidth: 0,
    shadowBlur: 8,
    shadowColor: '#000000',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    position: 85,
  }),
  makeBuiltIn('builtin-bold-box', 'Bold Box', 'Bold text in a solid box', 'bold', {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: 'bold',
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.85,
    outlineWidth: 0,
    padding: 12,
  }),
  makeBuiltIn('builtin-modern', 'Modern', 'Clean modern look', 'modern', {
    fontFamily: 'Inter',
    fontSize: 26,
    fontColor: '#FFFFFF',
    backgroundColor: '#1a1a1a',
    backgroundOpacity: 0.6,
    outlineWidth: 0,
    shadowBlur: 4,
    padding: 10,
    lineHeight: 1.5,
  }),
  makeBuiltIn('builtin-minimal-top', 'Minimal Top', 'Small text at the top', 'minimal', {
    fontFamily: 'Helvetica',
    fontSize: 20,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    outlineWidth: 0,
    position: 10,
    padding: 6,
  }),
  makeBuiltIn('builtin-neon', 'Neon', 'Bright colored text with glow', 'modern', {
    fontFamily: 'Poppins',
    fontSize: 30,
    fontWeight: 'bold',
    fontColor: '#00FF88',
    outlineColor: '#00FF88',
    outlineWidth: 1,
    shadowColor: '#00FF88',
    shadowBlur: 12,
    backgroundColor: '#000000',
    backgroundOpacity: 0,
  }),
  makeBuiltIn('builtin-yellow-box', 'Yellow Box', 'Yellow text on dark background', 'bold', {
    fontFamily: 'Roboto',
    fontSize: 28,
    fontWeight: 'bold',
    fontColor: '#FFD700',
    backgroundColor: '#1a1a1a',
    backgroundOpacity: 0.9,
    outlineWidth: 0,
    padding: 14,
  }),
  makeBuiltIn('builtin-typewriter', 'Typewriter', 'Monospace retro look', 'cinematic', {
    fontFamily: 'Ubuntu',
    fontSize: 22,
    fontColor: '#E0E0E0',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    outlineWidth: 0,
    lineHeight: 1.6,
    padding: 10,
  }),
];

/**
 * TemplateEngine - stateless template management.
 */
export class TemplateEngine {
  getBuiltInTemplates(): readonly SubtitleTemplate[] {
    return BUILT_IN_TEMPLATES;
  }

  createTemplate(
    name: string,
    style: Partial<SubtitleStyle>,
    options?: { description?: string; category?: TemplateCategory }
  ): SubtitleTemplate {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      name: name.slice(0, 100),
      description: (options?.description ?? '').slice(0, 500),
      style: sanitizeStyle(style),
      category: options?.category ?? 'custom',
      isBuiltIn: false,
      isPublic: false,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateTemplate(
    templates: readonly SubtitleTemplate[],
    id: string,
    patch: Partial<Pick<SubtitleTemplate, 'name' | 'description' | 'category' | 'isPublic'> & { style: Partial<SubtitleStyle> }>
  ): readonly SubtitleTemplate[] {
    return templates.map((t) => {
      if (t.id !== id || t.isBuiltIn) return t;
      return {
        ...t,
        ...(patch.name !== undefined && { name: patch.name.slice(0, 100) }),
        ...(patch.description !== undefined && { description: patch.description.slice(0, 500) }),
        ...(patch.category !== undefined && { category: patch.category }),
        ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
        ...(patch.style !== undefined && { style: sanitizeStyle({ ...t.style, ...patch.style }) }),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  removeTemplate(
    templates: readonly SubtitleTemplate[],
    id: string
  ): readonly SubtitleTemplate[] {
    return templates.filter((t) => t.id !== id || t.isBuiltIn);
  }

  applyTemplate(template: SubtitleTemplate): SubtitleStyle {
    return sanitizeStyle(template.style);
  }

  mergeStyleOverrides(
    base: SubtitleStyle,
    overrides: Partial<SubtitleStyle>
  ): SubtitleStyle {
    return sanitizeStyle({ ...base, ...overrides });
  }

  getTemplateById(
    templates: readonly SubtitleTemplate[],
    id: string
  ): SubtitleTemplate | undefined {
    return (
      templates.find((t) => t.id === id) ??
      BUILT_IN_TEMPLATES.find((t) => t.id === id)
    );
  }
}

export { ALLOWED_FONT_FAMILIES };
