import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '..', '.auth', 'user.json');

const TEST_EMAIL = `e2e-${Date.now()}@test.local`;

setup('authenticate via test-login', async ({ page }) => {
  // Create user and get session cookie via test-only endpoint
  const res = await page.request.post('/api/auth/test-login', {
    data: { email: TEST_EMAIL },
  });
  expect(res.ok()).toBeTruthy();

  // Verify we're authenticated by navigating to dashboard
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('My Reels', { timeout: 10000 });

  // Save signed-in state
  await page.context().storageState({ path: authFile });
});
