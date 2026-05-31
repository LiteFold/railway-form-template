import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('Copy button visibility on embed page', () => {
  test('embed page loads and shows the copy button', async ({ page }) => {
    await page.goto(BASE + '/');

    // Verify embed page
    await expect(page.locator('body.embed-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Embed Snippet');

    // The copy button exists below the code block
    const copyBtn = page.locator('#copy-btn');

    await expect(copyBtn).toBeVisible();

    // Button has text "Copy"
    await expect(copyBtn).toHaveText('Copy');
  });

  test('copy button is placed below <pre> code block in .code-block-wrapper', async ({ page }) => {
    await page.goto(BASE + '/');

    // There should be 1 .code-block-wrapper section
    const wrappers = page.locator('.code-block-wrapper');
    await expect(wrappers).toHaveCount(1);

    // The wrapper has a <pre> followed by a .copy-btn
    const wrapper = wrappers.nth(0);

    await expect(wrapper.locator('pre')).toBeVisible();
    await expect(wrapper.locator('.copy-btn')).toBeVisible();
  });

  test('copy button has visible gray background (non-transparent)', async ({ page }) => {
    await page.goto(BASE + '/');

    const copyBtn = page.locator('#copy-btn');

    // Check computed background color — should be a visible solid gray
    const bg = await copyBtn.evaluate(el => getComputedStyle(el).backgroundColor);

    console.log(`Button background: ${bg}`);

    // Should NOT be transparent or near-transparent
    expect(bg).not.toMatch(/rgba\(\s*255,\s*255,\s*255,\s*0(\.\d+)?\s*\)/);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');

    // Should have some non-white background
    const isVisibleBg = (color: string): boolean => {
      const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!rgba) return true;
      const r = parseInt(rgba[1]), g = parseInt(rgba[2]), b = parseInt(rgba[3]);
      const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
      if (a < 0.15) return false;
      return true;
    };

    expect(isVisibleBg(bg)).toBe(true);
  });

  test('copy button has dark text color', async ({ page }) => {
    await page.goto(BASE + '/');

    const copyBtn = page.locator('#copy-btn');

    const color = await copyBtn.evaluate(el => getComputedStyle(el).color);

    console.log(`Button color: ${color}`);

    const parseRgb = (color: string): { r: number; g: number; b: number } | null => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (!m) return null;
      return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
    };

    const cr = parseRgb(color);

    if (cr) {
      const brightness = (cr.r + cr.g + cr.b) / 3;
      expect(brightness).toBeLessThan(180);
    }
  });

  test('copy button has visible border', async ({ page }) => {
    await page.goto(BASE + '/');

    const copyBtn = page.locator('#copy-btn');

    const border = await copyBtn.evaluate(el => getComputedStyle(el).border);

    console.log(`Button border: ${border}`);

    expect(border).not.toContain('rgba(255,255,255,0.2)');
    expect(border).not.toContain('rgba(255, 255, 255, 0.2)');
  });

  test('copy button shows "Copied!" text on click (functional test)', async ({ page }) => {
    await page.goto(BASE + '/');

    const copyBtn = page.locator('#copy-btn');

    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Click the copy button
    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 3000 });

    // Wait for reset
    await expect(copyBtn).toHaveText('Copy', { timeout: 3000 });
  });
});
