import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@reelstack/types': path.resolve(__dirname, '../types/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
