import { defineConfig } from 'vitest/config';
import { mdAsText } from '../../vitest.shared';

export default defineConfig({
  plugins: [mdAsText],
  test: {
    globals: true,
    setupFiles: ['../../tests/setup.ts'],
  },
});
