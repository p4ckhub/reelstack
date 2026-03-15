import { test, expect } from '@playwright/test';

const nav = { waitUntil: 'domcontentloaded' } as const;

test.describe('Dashboard', () => {
  test('shows My Reels heading and Create Reel button', async ({ page }) => {
    await page.goto('/dashboard', nav);
    await expect(page.locator('h1')).toContainText('My Reels');
    await expect(page.getByRole('main').getByRole('link', { name: /create reel/i })).toBeVisible();
  });

  test('shows usage card with tier and renders info', async ({ page }) => {
    await page.goto('/dashboard', nav);
    // Usage card should show tier badge and render count
    await expect(page.getByText(/renders this month/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/tokens/i)).toBeVisible();
  });

  test('shows empty state or reel list', async ({ page }) => {
    await page.goto('/dashboard', nav);
    const emptyState = page.getByText(/no reels yet/i);
    const reelTable = page.locator('table');
    await expect(emptyState.or(reelTable)).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation has correct links', async ({ page }) => {
    await page.goto('/dashboard', nav);
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByRole('link', { name: 'Create Reel' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'My Reels' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Templates' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'API Keys' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Settings' })).toBeVisible();
  });
});

test.describe('Reel Wizard', () => {
  test('wizard page loads with script input', async ({ page }) => {
    await page.goto('/dashboard/reel/new', nav);
    await expect(page.getByText(/script/i).first()).toBeVisible();
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  test('wizard has voice/language selection', async ({ page }) => {
    await page.goto('/dashboard/reel/new', nav);
    await expect(page.getByText(/voice/i).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Templates page', () => {
  test('shows built-in presets', async ({ page }) => {
    await page.goto('/dashboard/templates', nav);
    await expect(page.locator('h1')).toContainText('Templates');
    await expect(page.getByText('Built-in Presets')).toBeVisible();
    // At least one built-in template card
    await expect(page.getByText('Sample Text').first()).toBeVisible({ timeout: 10000 });
  });

  test('shows My Templates section', async ({ page }) => {
    await page.goto('/dashboard/templates', nav);
    await expect(page.getByText('My Templates')).toBeVisible();
  });
});

test.describe('API Keys page', () => {
  test('loads with heading and create button', async ({ page }) => {
    await page.goto('/dashboard/api-keys', nav);
    await expect(page.getByText(/api key/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /create/i })).toBeVisible();
  });
});

test.describe('Settings page', () => {
  test('shows account info and preferences', async ({ page }) => {
    await page.goto('/dashboard/settings', nav);
    await expect(page.getByText(/settings/i).first()).toBeVisible();
    await expect(page.getByText(/account/i).first()).toBeVisible({ timeout: 10000 });
  });
});
