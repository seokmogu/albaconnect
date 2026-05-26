import { test, expect } from '@playwright/test';

/**
 * Worker signup flow E2E test.
 * Verifies that a new worker can navigate to signup, select worker role,
 * fill the form, and be redirected on success when the API is available.
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
    const workerBtn = page.getByRole('button', { name: /구직자로 시작/ });
    await workerBtn.click();
    // Should now show the signup form with name/email fields
    await expect(page.getByLabel('이름')).toBeVisible();
    await expect(page.getByLabel('이메일')).toBeVisible();
    await expect(page.getByLabel('비밀번호')).toBeVisible();
    await expect(page.getByLabel('전화번호')).toBeVisible();
  });

  test('shows validation — submit button is present', async ({ page }) => {
    await page.goto('/signup');
    const workerBtn = page.getByRole('button', { name: /구직자로 시작/ });
    await workerBtn.click();
    // Submit button is rendered
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('can fill signup form fields', async ({ page }) => {
    await page.goto('/signup');
    const workerBtn = page.getByRole('button', { name: /구직자로 시작/ });
    await workerBtn.click();

    await page.getByLabel('이름').fill('테스트 근로자');
    await page.getByLabel('이메일').fill('e2e_worker@test.albaconnect.kr');
    await page.getByLabel('비밀번호').fill('TestPass123!');
    await page.getByLabel('전화번호').fill('010-9999-0001');

    // Verify values are filled
    await expect(page.getByLabel('이름')).toHaveValue('테스트 근로자');
    await expect(page.getByLabel('이메일')).toHaveValue('e2e_worker@test.albaconnect.kr');
  });

  test('submits worker signup and redirects to worker home', async ({ page }) => {
    const email = `e2e_worker_${Date.now()}@test.albaconnect.kr`;

    await page.goto('/signup?role=worker');
    await page.getByLabel('이름').fill('테스트 근로자');
    await page.getByLabel('이메일').fill(email);
    await page.getByLabel('비밀번호').fill('TestPass123!');
    await page.getByLabel('전화번호').fill('010-9999-0001');
    await page.locator('form button[type="button"]').first().click();

    await page.getByRole('button', { name: '가입하기' }).click();

    await expect(page).toHaveURL(/\/worker\/home/, { timeout: 10_000 });
    await expect(page.getByText('테스트 근로자님')).toBeVisible();
  });
});
