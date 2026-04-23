import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * @reelstack/agent imports prompt templates as raw text from .md files
 * (via import attributes). Next.js configures raw-loader for .md, but
 * Vitest (Vite) needs an explicit transform to do the same.
 */
const mdAsText = {
  name: 'md-as-text',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (id.endsWith('.md')) {
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [mdAsText],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
