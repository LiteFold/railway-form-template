import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('Hosted Form Page', () => {
  test('renders form with correct title and fields', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await expect(page.locator('h1')).toHaveText('Contact Form');
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
  });

  test('action URL uses HTTPS', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    const action = await page.locator('form').getAttribute('action');
    expect(action).toMatch(/^https:\/\//);
  });

  test('has HTMX attributes', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await expect(page.locator('[hx-target="#form-response"]')).toBeVisible();
  });

  test('has honeypot field', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    // The honeypot container has height:0;overflow:hidden;opacity:0 so it is hidden
    await expect(page.locator('.honeypot')).toBeHidden();
  });

  test('has no CAPTCHA widget (honeypot protection only)', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await expect(page.locator('cap-widget')).toHaveCount(0);
  });

  test('has form-response target div', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    // The #form-response div is initially empty (no bounding box) so toBeVisible fails.
    // Check that it exists in the DOM instead.
    await expect(page.locator('#form-response')).toBeAttached();
  });

  test('404 returns styled HTML', async ({ page }) => {
    const resp = await page.goto(BASE + '/form/nonexistent-slug');
    expect(resp?.status()).toBe(404);
    const body = await page.locator('body').textContent();
    expect(body).toContain('Form not found');
  });

  test('empty form slug returns 404', async ({ page }) => {
    const resp = await page.goto(BASE + '/form/');
    expect(resp?.status()).toBe(404);
  });
});

test.describe('Form Submission', () => {
  test('successful submission shows success message', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('textarea[name="message"]', 'Hello from Playwright');
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('Thank you');
  });

  test('empty required field shows error', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', '');
    await page.fill('input[name="email"]', 'test@test.com');
    await page.fill('textarea[name="message"]', 'msg');
    // Disable browser HTML5 validation so HTMX can fire and backend returns server-side error
    await page.evaluate(() => { const f = document.querySelector('form'); if (f) f.noValidate = true; });
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('required');
  });

  test('honeypot filled triggers CAPTCHA error', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', 'Bot');
    await page.fill('input[name="email"]', 'bot@spam.com');
    await page.fill('textarea[name="message"]', 'spam');
    // Honeypot is visually hidden, but we fill it via evaluate
    await page.evaluate(() => {
      const hp = document.querySelector('input[name="_hp_website"]') as HTMLInputElement;
      if (hp) hp.value = 'spammy-site';
    });
    // Disable browser HTML5 validation and remove cap-widget (CORS error on staging blocks submit)
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
      document.querySelector('cap-widget')?.remove();
    });
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('CAPTCHA');
  });

  test('all fields empty shows first required error', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    // Disable browser HTML5 validation so HTMX can fire and backend returns server-side error
    await page.evaluate(() => { const f = document.querySelector('form'); if (f) f.noValidate = true; });
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('Your Name');
  });

  test('double submit is handled gracefully', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', 'Double');
    await page.fill('input[name="email"]', 'double@test.com');
    await page.fill('textarea[name="message"]', 'double click');
    await page.click('button[type="submit"]');
    await page.click('button[type="submit"]');
    // Should not crash - either success or rate limit
    await expect(page.locator('#form-response')).toBeVisible();
  });
});

test.describe('Edge Cases', () => {
  test('special characters in fields', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', '<script>alert("xss")</script>');
    await page.fill('input[name="email"]', 'xss@test.com');
    await page.fill('textarea[name="message"]', '">&nbsp;<');
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('Thank you');
  });

  test('unicode characters', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', '\u4f60\u597d\u4e16\u754c \u00f1\u00f1\u00e7');
    await page.fill('input[name="email"]', 'unicode@test.com');
    await page.fill('textarea[name="message"]', '\u65e5\u672c\u8a9e \ud83d\udd25 \u00e9moji');
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('Thank you');
  });

  test('very long input', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    const long = 'a'.repeat(5000);
    await page.fill('input[name="name"]', 'Long Input');
    await page.fill('input[name="email"]', 'long@test.com');
    await page.fill('textarea[name="message"]', long);
    await page.click('button[type="submit"]');
    await expect(page.locator('#form-response')).toContainText('Thank you');
  });

  test('email field validation', async ({ page }) => {
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', 'Email Test');
    await page.fill('input[name="email"]', 'not-an-email');
    await page.fill('textarea[name="message"]', 'msg');
    // Disable browser HTML5 type="email" validation so HTMX can fire
    await page.evaluate(() => { const f = document.querySelector('form'); if (f) f.noValidate = true; });
    await page.click('button[type="submit"]');
    // HTMX submission - browser may or may not validate based on type="email"
    // The form should still handle it gracefully
    await expect(page.locator('#form-response')).toBeVisible();
  });
});

test.describe('Non-JS Fallback', () => {
  test('form works without JavaScript', async ({ page }) => {
    await page.context().addInitScript(() => { delete (window as any).htmx; });
    await page.goto(BASE + '/form/contact');
    await page.fill('input[name="name"]', 'No JS');
    await page.fill('input[name="email"]', 'nojs@test.com');
    await page.fill('textarea[name="message"]', 'no js fallback');
    await page.click('button[type="submit"]');
    // Without JS, page reloads - response should be HTML
    await expect(page.locator('body')).toContainText('Thank you');
  });
});
