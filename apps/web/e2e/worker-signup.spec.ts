import { test, expect } from '@playwright/test';

/**
 * Worker signup flow E2E test.
 * Verifies that a new worker can navigate to signup, select worker role,
 * fill the form, and be redirected on success.
 * NOTE: In CI without a live backend, we verify UI rendering and form interaction only.
 */
test.describe('Worker signup flow', () => {
  test('renders signup role selection page', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup/);
    // Role selection screen
    await expect(page.locator('h1')).toContainText('AlbaConnect 가입');
  });

  test('navigates to worker form after selecting worker role', async ({ page }) => {
    await page.goto('/signup');
    // Click the worker role button (contains "근로자")
    const workerBtn = page.locator('button', { hasText: '근로자' }).first();
    await workerBtn.click();
    // Should now show the signup form with name/email fields
    await expect(page.locator('input[placeholder="홍길동"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toBeVisible();
  });

  test('shows validation — submit button is present', async ({ page }) => {
    await page.goto('/signup');
    const workerBtn = page.locator('button', { hasText: '근로자' }).first();
    await workerBtn.click();
    // Submit button is rendered
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('can fill signup form fields', async ({ page }) => {
    await page.goto('/signup');
    const workerBtn = page.locator('button', { hasText: '근로자' }).first();
    await workerBtn.click();

    await page.locator('input[placeholder="홍길동"]').fill('테스트 근로자');
    await page.locator('input[type="email"]').fill('e2e_worker@test.albaconnect.kr');
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('input[type="tel"]').fill('010-9999-0001');

    // Verify values are filled
    await expect(page.locator('input[placeholder="홍길동"]')).toHaveValue('테스트 근로자');
    await expect(page.locator('input[type="email"]')).toHaveValue('e2e_worker@test.albaconnect.kr');
  });
});
