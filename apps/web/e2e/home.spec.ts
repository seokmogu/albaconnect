import { test, expect } from '@playwright/test';

test.describe('Worker home page (unauthenticated)', () => {
  test('redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/');
    // Expect redirect to login page for unauthenticated users
    await expect(page).toHaveURL(/\/login/);
  });
});
