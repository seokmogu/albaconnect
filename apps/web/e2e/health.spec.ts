import { test, expect } from '@playwright/test';

test.describe('API health endpoint', () => {
  test('returns status ok', async ({ request }) => {
    const apiBaseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const response = await request.get(`${apiBaseURL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok' });
  });
});
