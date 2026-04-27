import type { Plugin } from 'vitest/config';

/**
 * Vite plugin: import `*.md` files as raw strings.
 *
 * Prompt templates (planner.md, short-film-director.md, …) ship as .md
 * and are pulled in via `import x from './x.md' with { type: 'text' }`.
 * Bun and Next.js (turbopack + webpack raw-loader) handle this natively;
 * Vitest does not — anything in the dependency graph that imports a .md
 * file (agent, modules that depend on agent, web, etc.) needs this
 * transform or vitest dies parsing the markdown as JS.
 */
export const mdAsText: Plugin = {
  name: 'md-as-text',
  enforce: 'pre',
  transform(code: string, id: string) {
    if (id.endsWith('.md')) {
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    }
    return null;
  },
};
