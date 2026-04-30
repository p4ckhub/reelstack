/**
 * Variable substitution for Hyperframes HTML templates.
 *
 * Templates use `{{variable_name}}` placeholders. At render time we
 * clone the composition directory, replace placeholders with caller-
 * provided values, and hand the temp directory to `hyperframes render`.
 *
 * Why string substitution instead of `data-var-*` + CLI flags:
 * - The CLI doesn't expose a variable-injection flag yet
 * - String substitution handles nested compositions, scripts, and CSS
 *   uniformly — anywhere the placeholder appears gets filled
 * - Keeps the template format identical to what a human author would
 *   write + preview with `hyperframes preview`
 *
 * Three substitution modes, picked by variable-name suffix:
 *
 *   - `*Url` / `*Src` — sanitized URL (http/https only). Rejects
 *     `javascript:`, relative paths, anything with whitespace or
 *     control chars.
 *   - `*Block` / `*Html` — raw HTML block. The caller is responsible
 *     for escaping any user input INSIDE the block. Used for server-
 *     generated HTML+JS snippets (e.g. `endCardBlock` from
 *     `buildHfEndCardBlock` in `@reelstack/agent`).
 *   - everything else — HTML-escaped (`<` → `&lt;`, etc).
 */

export type TemplateVariables = Readonly<Record<string, string | number | boolean>>;

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function htmlEscape(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/**
 * Is this variable name likely a URL? We trust the template author to
 * name URL variables with `Url` / `_url` / `Src` suffix; everything else
 * gets the generic HTML-escape treatment.
 */
function isUrlKey(key: string): boolean {
  return /url|src$/i.test(key);
}

/**
 * Is this variable name a raw HTML block? The orchestrator is
 * responsible for escaping any user input INSIDE the block. We pass
 * the value through verbatim so HTML+CSS+JS snippets (e.g. the
 * shared end-card overlay built by `buildHfEndCardBlock`) reach the
 * browser as DOM rather than as escaped text.
 */
function isHtmlBlockKey(key: string): boolean {
  return /(Block|Html)$/.test(key);
}

const SAFE_URL = /^https?:\/\/[^\s'"<>]+$/;

function sanitizeUrl(raw: unknown): string {
  const s = String(raw);
  if (!SAFE_URL.test(s)) {
    throw new Error(
      `Unsafe URL value "${s.substring(0, 60)}" — only http(s) URLs allowed in template vars.`
    );
  }
  // No further escaping needed — the regex already rules out injection chars.
  return s;
}

/**
 * Replace every `{{key}}` in `source` with the corresponding value from
 * `vars`. Missing keys throw — silent omission would produce broken
 * HTML that ships to a render job without warning.
 */
export function injectVariables(source: string, vars: TemplateVariables): string {
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Template variable "${key}" is not defined in vars.`);
    }
    const value = vars[key];
    if (isUrlKey(key)) return sanitizeUrl(value);
    if (isHtmlBlockKey(key)) return String(value);
    return htmlEscape(value);
  });
}
