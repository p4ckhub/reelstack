/**
 * Mustache-style template renderer for LLM prompts.
 *
 * Supports two substitution types:
 * - Variables: {{variableName}} → replaced with value from variables map
 * - Partials: {{> partial-name}} → replaced with content from partials map
 *
 * Zero dependencies. Partials are resolved first, then variables.
 */

/**
 * Render a template string with variables and partials.
 *
 * @param template - Template string with {{variable}} and {{> partial}} placeholders
 * @param variables - Map of variable names to their string values
 * @param partials - Map of partial names to their template content
 * @returns Rendered string with all placeholders resolved
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string> = {},
  partials: Record<string, string> = {}
): string {
  // 1. Resolve partials: {{> name}} → partials[name]
  // Partials can themselves contain variables, so resolve them first.
  let result = template.replace(/\{\{>\s*([^\s}]+)\s*\}\}/g, (_match, name: string) => {
    if (!(name in partials)) return `[MISSING PARTIAL: ${name}]`;
    return partials[name];
  });

  // 2. Resolve variables: {{variableName}} → variables[variableName]
  // Unmatched variables resolve to empty string (graceful for optional sections).
  result = result.replace(/\{\{([a-zA-Z_]\w*)\}\}/g, (_match, name: string) =>
    name in variables ? variables[name] : ''
  );

  return result;
}
