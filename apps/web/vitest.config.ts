import { defineConfig } from 'vitest/config';
import path from 'path';
import { mdAsText } from '../../vitest.shared';

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
