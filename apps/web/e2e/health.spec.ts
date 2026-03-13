import { test, expect } from '@playwright/test';

test.describe('API health endpoint', () => {
  test('returns status ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok' });
  });
});
