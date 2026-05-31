import { test, expect, chromium } from '@playwright/test';

test.describe('Embed Snippet Copy Buttons', () => {
  test.beforeEach(async ({ page }) => {
    // Grant clipboard permissions for headless mode
    await page.goto('/');
  });

  test('the Copy button is visible on the page', async ({ page }) => {
    await page.waitForSelector('#copy-btn');

    await expect(page.locator('#copy-btn')).toBeVisible();
  });

  test('Copy button shows "Copied!" and reverts to "Copy"', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
    await page.goto('/');

    const btn = page.locator('#copy-btn');
    await expect(btn).toHaveText('Copy');

    // Click the copy button
    await btn.click();

    // Text should change to "Copied!"
    await expect(btn).toHaveText('Copied!');

    // After 2.5s, it should revert to "Copy"
    await page.waitForTimeout(2500);
    await expect(btn).toHaveText('Copy');
  });

  test('no JS console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#copy-btn');
    await page.waitForTimeout(500);

    expect(errors.length).toBe(0);
  });

  test('no JS console errors when clicking the copy button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
    await page.goto('/');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForSelector('#copy-btn');
    await page.locator('#copy-btn').click();
    await page.waitForTimeout(500);

    expect(errors.length).toBe(0);
  });
});
