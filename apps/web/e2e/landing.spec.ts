import { test, expect } from '@playwright/test';

// Landing tests run without auth
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing page', () => {
  test('shows hero and CTA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: /start free|create/i }).first()).toBeVisible();
  });

  test('navigates to pricing page', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'commit' });
    await expect(page.locator('h1')).toContainText('Pricing');
    // Should show tier cards (Free, Solo, Pro, Agency)
    await expect(page.getByRole('heading', { name: 'Free', level: 2 })).toBeVisible();
  });

  test('CTA links to login (not signup)', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'commit' });
    const ctaLinks = page.locator('a[href="/login"]');
    await expect(ctaLinks.first()).toBeVisible();
  });
});

test.describe('Login page', () => {
  test('shows email-only form (no password field)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    // No password field
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /send magic link/i })).toBeVisible();
  });

  test('shows "no password needed" message', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(page.getByText(/no password needed/i)).toBeVisible();
  });
});
