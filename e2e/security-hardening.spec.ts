import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';
const ADMIN_PW = 'admin123';

// Helper: quickly send N login attempts via HTTP (avoids UI overhead for rate-limit tests)
async function sendLoginAttempts(page: any, count: number, password: string = 'wrongpassword') {
  for (let i = 0; i < count; i++) {
    const resp = await page.request.post(`${BASE}/admin/login`, {
      form: { password },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    await resp.body(); // drain to avoid hanging
  }
}

test.describe('Security Hardening — Login Page', () => {
  test('1. Login page loads normally', async ({ page }) => {
    const resp = await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    expect(resp?.status()).toBe(200);
    await expect(page.locator('h2')).toContainText('Admin Login');
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    // No error banner on initial load
    await expect(page.locator('.error, .alert-error, div:has-text("Too many")')).toHaveCount(0);
  });
});

test.describe('Security Hardening — Login Rate Limiting', () => {
  test('2a. Wrong password <10x shows "Invalid password" (no rate limit yet)', async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });

    await page.fill('input[name="password"]', 'wrong1');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid password')).toBeVisible();
  });

  test('2b. Wrong password >10x shows "Too many attempts"', async ({ page }, testInfo) => {
    // NOTE: This test requires the security hardening (feature/t_44003bc0) to be deployed.
    // Requires: check_rate_limit(pool, ip, prefix="login:") in admin.py POST /login.
    // On current staging (without deployment), this will fail — rate limiting not active.

    test.skip(
      !process.env.E2E_SECURITY_DEPLOYED,
      'Security hardening not deployed to this environment — set E2E_SECURITY_DEPLOYED=true after feature/t_44003bc0 is deployed'
    );

    await sendLoginAttempts(page, 12, 'bruteforce-attempt');

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="password"]', 'another-wrong');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.textContent('body');
    const hasRateLimit = pageContent?.includes('Too many login attempts')
      || pageContent?.includes('Too many attempts');
    expect(hasRateLimit).toBeTruthy();
  });

  test('2c. Normal form submissions still work after login rate limiting', async ({ page }, testInfo) => {
    // NOTE: This test requires the security hardening to be deployed.
    test.skip(
      !process.env.E2E_SECURITY_DEPLOYED,
      'Security hardening not deployed — set E2E_SECURITY_DEPLOYED=true after deployment'
    );

    await sendLoginAttempts(page, 12, 'bruteforce');

    // Login rate limit should NOT affect public form submissions (separate prefix)
    await page.goto(`${BASE}/form/contact`, { waitUntil: 'networkidle' });
    await page.waitForSelector('form');

    await page.locator('form input[type="text"]').first().fill('Test User');
    await page.locator('form input[type="email"]').first().fill('test@example.com');
    await page.locator('form textarea').first().fill('This is a test message');
    await page.click('button[type="submit"]');

    await expect(page.locator('#form-response')).toContainText('Thank you', { timeout: 10000 });
  });
});

test.describe('Security Hardening — Session Cookie Flags', () => {
  test('3. Session cookie has Secure flag set', async ({ page }, testInfo) => {
    // NOTE: Requires https_only=True on SessionMiddleware (feature/t_44003bc0)
    test.skip(
      !process.env.E2E_SECURITY_DEPLOYED,
      'Security hardening not deployed — set E2E_SECURITY_DEPLOYED=true after deployment'
    );

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'session');

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.name).toBe('session');
    expect(sessionCookie!.secure).toBe(true);
  });

  test('3b. Session cookie has SameSite=Lax attribute', async ({ page }, testInfo) => {
    // NOTE: Requires same_site="lax" on SessionMiddleware (feature/t_44003bc0)
    test.skip(
      !process.env.E2E_SECURITY_DEPLOYED,
      'Security hardening not deployed — set E2E_SECURITY_DEPLOYED=true after deployment'
    );

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'session');

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.sameSite).toBe('Lax');
  });
});

test.describe('Security Hardening — Normal Flow Unaffected', () => {
  test('4. Normal form submissions work (rate limit not affected by login limit)', async ({ page }) => {
    await page.goto(`${BASE}/form/contact`, { waitUntil: 'networkidle' });
    await page.waitForSelector('form');

    await page.locator('form input[type="text"]').first().fill('Normal User');
    await page.locator('form input[type="email"]').first().fill('normal@example.com');
    await page.locator('form textarea').first().fill('Normal submission test');
    await page.click('button[type="submit"]');

    await expect(page.locator('#form-response')).toContainText('Thank you', { timeout: 10000 });
  });

  test('4b. Correct admin password still logs in after cooldown', async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="password"]', ADMIN_PW);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('4c. Unauthenticated access still redirects to login', async ({ page }) => {
    await page.goto(`${BASE}/admin/forms`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/admin/login');
  });
});
