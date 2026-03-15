import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for AlbaConnect web app.
 *
 * Local: set USE_EXISTING_SERVER=true to skip the webServer block (if you
 *        already have `pnpm dev` running).
 * CI:    leave USE_EXISTING_SERVER unset — Playwright will start the Next.js
 *        dev server automatically via the webServer block.
 *
 * Note: setting USE_EXISTING_SERVER to the *string* "false" is treated as
 * truthy by Node.js, so we explicitly check for the string "true".
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer:
    process.env.USE_EXISTING_SERVER === 'true'
      ? undefined
      : {
          command: 'pnpm dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            NEXT_PUBLIC_API_URL:
              process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
          },
        },
});
