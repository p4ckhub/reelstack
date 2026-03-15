/**
 * CSS validation for user-uploaded brand files.
 * Blocks dangerous patterns that could be used for XSS or SSRF.
 */

const DANGEROUS_PATTERNS = [
  '<script',
  'javascript:',
  '@import',
  'expression(',
  '-moz-binding',
  'behavior:',
  'url(',
  'data:',
  '@charset',
  '\\',
] as const;

const MAX_CSS_SIZE = 50 * 1024; // 50KB

export interface CssValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate user-uploaded brand CSS.
 * Checks size limit and blocks dangerous patterns.
 */
export function validateBrandCss(css: string): CssValidationResult {
  if (Buffer.byteLength(css, 'utf8') > MAX_CSS_SIZE) {
    return { valid: false, error: `CSS file too large (max ${MAX_CSS_SIZE / 1024}KB)` };
  }

  const lower = css.toLowerCase();
  for (const pattern of DANGEROUS_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return { valid: false, error: `CSS contains disallowed pattern: ${pattern}` };
    }
  }

  return { valid: true };
}
