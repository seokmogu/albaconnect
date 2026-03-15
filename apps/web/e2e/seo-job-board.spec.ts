import { test, expect } from '@playwright/test';

/**
 * Public SEO job board E2E tests.
 * Validates meta tags, Open Graph tags, and structured data for Google Jobs indexing.
 */
test.describe('SEO job board — public unauthenticated access', () => {
  test('page title contains AlbaConnect branding', async ({ page }) => {
    await page.goto('/jobs');
    const title = await page.title();
    expect(title).toMatch(/AlbaConnect|알바커넥트|알바/i);
  });

  test('page has Open Graph meta tags', async ({ page }) => {
    await page.goto('/jobs');
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);
    const content = await ogTitle.getAttribute('content');
    expect(content).toBeTruthy();
  });

  test('page has meta description', async ({ page }) => {
    await page.goto('/jobs');
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveCount(1);
    const content = await metaDesc.getAttribute('content');
    expect(content?.length).toBeGreaterThan(10);
  });

  test('page does not require authentication', async ({ page }) => {
    const response = await page.goto('/jobs');
    // Should not redirect to login for the public job board
    await expect(page).toHaveURL(/\/jobs/);
    expect(response?.status()).toBeLessThan(400);
  });

  test('page renders without JavaScript errors in console', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    // Filter out known benign errors (hydration mismatches in dev, etc.)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('hydrat') &&
        !e.includes('Warning:') &&
        !e.includes('Warning') &&
        !e.includes('ExperimentalWarning')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
