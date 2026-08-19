import { test, expect } from '@playwright/test';

// Public routes only - no backend/auth fixture needed. Covers app-shell
// bootstrapping (routing, i18n catalog, lazy-loaded chunks) actually
// rendering correctly in a real browser, not just compiling.

test('landing page renders the hero section', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.landing-page')).toBeVisible();
});

test('unknown route falls back to the SPA shell, not a blank page', async ({
  page,
}) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('visiting a protected route while signed out redirects to the landing page', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/');
  await expect(page.locator('main.landing-page')).toBeVisible();
});

test('qfield-open interstitial is reachable without auth', async ({
  page,
}) => {
  const response = await page.goto('/qfield-open');
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/qfield-open/);
});
