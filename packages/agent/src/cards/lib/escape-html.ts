/**
 * HTML escape for user-supplied strings inside a card block. The
 * variable injector passes `*Block` keys through verbatim, so any
 * user input INSIDE the block has to be escaped here at the source.
 */
export function escapeHtml(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string for use as a JS string literal inside a `<script>`
 * tag. Unlike escapeHtml, this is for embedding in JavaScript code
 * that will run in the browser (not text nodes). Handles backticks,
 * backslashes, and embedded `</script>` sequences that would otherwise
 * break out of the script tag.
 */
export function escapeJsString(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/<\/script/gi, '<\\/script');
}
