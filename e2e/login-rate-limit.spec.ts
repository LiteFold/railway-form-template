import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('Login Rate Limiting', () => {
  test('rate limits after repeated wrong password attempts', async ({ page }) => {
    // Navigate to login page
    await page.goto(`${BASE}/admin/login`);
    await expect(page.locator('h2')).toContainText('Admin Login');

    // Submit wrong password repeatedly (rate_limit default = 10)
    let seenRateLimit = false;
    for (let i = 0; i < 15; i++) {
      await page.fill('input[name="password"]', `wrong${i}`);
      await page.click('button[type="submit"]');

      // Check if we got rate-limited
      const body = await page.locator('body').innerText();
      if (body.includes('Too many login attempts')) {
        seenRateLimit = true;
        break;
      }
    }

    // Verify rate limiting was triggered
    expect(seenRateLimit).toBeTruthy();
    await expect(page.locator('text=Too many login attempts')).toBeVisible();
  });
});
