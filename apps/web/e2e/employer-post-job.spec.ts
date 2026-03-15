import { test, expect } from '@playwright/test';

/**
 * Employer job posting flow E2E test.
 * Without a live backend, tests verify UI rendering and authentication redirect.
 */
test.describe('Employer job posting flow', () => {
  test('redirects unauthenticated user to login when accessing employer dashboard', async ({ page }) => {
    await page.goto('/employer/dashboard');
    // Should redirect to login for unauthenticated users
    await expect(page).toHaveURL(/\/(login|signup)/);
  });

  test('redirects unauthenticated user to login when accessing new job page', async ({ page }) => {
    await page.goto('/employer/jobs');
    await expect(page).toHaveURL(/\/(login|signup)/);
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    // Login form should have email and password fields
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login page has submit button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('can fill login form fields for employer', async ({ page }) => {
    await page.goto('/login');
    const emailField = page.locator('input[type="email"], input[placeholder*="이메일"]').first();
    const passwordField = page.locator('input[type="password"]').first();

    await emailField.fill(process.env.TEST_EMPLOYER_EMAIL ?? 'employer@test.albaconnect.kr');
    await passwordField.fill(process.env.TEST_EMPLOYER_PASS ?? 'TestPass123!');

    await expect(emailField).not.toBeEmpty();
    await expect(passwordField).not.toBeEmpty();
  });
});
