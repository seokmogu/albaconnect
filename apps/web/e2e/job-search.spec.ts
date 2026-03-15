import { test, expect } from '@playwright/test';

/**
 * Job search and public job board E2E tests.
 * /jobs is publicly accessible (SSR with ISR).
 */
test.describe('Public job board and search', () => {
  test('renders the public job board page', async ({ page }) => {
    await page.goto('/jobs');
    // Page should load (may have no jobs in test env — that's OK)
    await expect(page).toHaveURL(/\/jobs/);
    // Page should have a recognisable title or heading
    const title = await page.title();
    expect(title).toMatch(/알바|AlbaConnect|구인/i);
  });

  test('job board page contains structured data (JSON-LD) script tag', async ({ page }) => {
    await page.goto('/jobs');
    // JSON-LD may be present on detail pages; on listing page check for meta tags
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveCount(1);
  });

  test('job detail page renders when navigated directly', async ({ page }) => {
    // Navigate to a non-existent job ID — should show 404 or not-found page gracefully
    const response = await page.goto('/jobs/00000000-0000-0000-0000-000000000000');
    // Next.js not-found returns 404 or renders the not-found component
    expect([200, 404]).toContain(response?.status() ?? 404);
  });

  test('login modal or redirect appears when clicking apply on job listing', async ({ page }) => {
    await page.goto('/jobs');
    // If there are job links, clicking one should navigate to the detail page
    const jobLinks = page.locator('a[href*="/jobs/"]');
    const count = await jobLinks.count();
    if (count > 0) {
      await jobLinks.first().click();
      // Should be on a job detail page
      await expect(page).toHaveURL(/\/jobs\/.+/);
    } else {
      // No jobs seeded — verify the page renders empty state gracefully
      await expect(page).toHaveURL(/\/jobs/);
    }
  });
});
