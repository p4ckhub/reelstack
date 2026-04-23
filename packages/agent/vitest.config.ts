import { defineConfig } from 'vitest/config';

/**
 * Prompt templates / partials / guidelines live as .md files imported via
 * `with { type: 'text' }`. Bun and the Next.js bundlers handle that
 * natively, but Vitest (Vite) needs an explicit plugin.
 */
const mdAsText = {
  name: 'md-as-text',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (id.endsWith('.md')) {
      return {
        code: `export default ${JSON.stringify(code)};`,
        map: null,
      };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [mdAsText],
  test: {
    globals: true,
    setupFiles: ['../../tests/setup.ts'],
  },
});
