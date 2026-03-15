import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';

// Load .env file for E2E tests (Playwright doesn't load it automatically)
try {
  const envFile = readFileSync(path.join(__dirname, '../../.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env file not found, skip
}

const authFile = path.join(__dirname, 'e2e', '.auth', 'user.json');

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  outputDir: './e2e/test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3077',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 15000,
    // Force connection close to avoid keep-alive issues with streaming Next.js responses
    extraHTTPHeaders: process.env.E2E_BASE_URL ? { 'Connection': 'close' } : {},
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npx next dev --port 3077',
    port: 3077,
    reuseExistingServer: true,
  },
  projects: [
    // Auth setup - creates test user session
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Public pages (no auth needed)
    {
      name: 'no-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /landing\.spec\.ts/,
    },
    // Authenticated pages (depends on setup)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      dependencies: ['setup'],
      testMatch: /dashboard\.spec\.ts/,
    },
  ],
});
