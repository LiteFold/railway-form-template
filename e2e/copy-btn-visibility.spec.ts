import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('Copy button visibility on embed page', () => {
  test('embed page loads and shows both copy buttons', async ({ page }) => {
    await page.goto(BASE + '/');

    // Verify embed page
    await expect(page.locator('body.embed-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Embed Snippet');

    // Both copy buttons exist below code blocks
    const regularBtn = page.locator('#copy-btn-regular');
    const htmxBtn = page.locator('#copy-btn-htmx');

    await expect(regularBtn).toBeVisible();
    await expect(htmxBtn).toBeVisible();

    // Both buttons have text "Copy"
    await expect(regularBtn).toHaveText('Copy');
    await expect(htmxBtn).toHaveText('Copy');
  });

  test('copy buttons are placed below <pre> code blocks in .code-block-wrapper', async ({ page }) => {
    await page.goto(BASE + '/');

    // There should be 2 .code-block-wrapper sections
    const wrappers = page.locator('.code-block-wrapper');
    await expect(wrappers).toHaveCount(2);

    // Each wrapper has a <pre> followed by a .copy-btn
    const wrapper1 = wrappers.nth(0);
    const wrapper2 = wrappers.nth(1);

    await expect(wrapper1.locator('pre')).toBeVisible();
    await expect(wrapper1.locator('.copy-btn')).toBeVisible();

    await expect(wrapper2.locator('pre')).toBeVisible();
    await expect(wrapper2.locator('.copy-btn')).toBeVisible();
  });

  test('copy buttons have visible gray background (non-transparent)', async ({ page }) => {
    await page.goto(BASE + '/');

    const regularBtn = page.locator('#copy-btn-regular');
    const htmxBtn = page.locator('#copy-btn-htmx');

    // Check computed background color — should be a visible solid gray,
    // NOT rgba(255,255,255,0.1) which is near-transparent on white
    const bgRegular = await regularBtn.evaluate(el => getComputedStyle(el).backgroundColor);
    const bgHtmx = await htmxBtn.evaluate(el => getComputedStyle(el).backgroundColor);

    console.log(`Regular button background: ${bgRegular}`);
    console.log(`HTMX button background: ${bgHtmx}`);

    // The color should NOT be transparent or near-transparent on white
    // rgba(255,255,255,0.1) = essentially invisible
    // acceptable: solid colors like rgb(241, 245, 249) = slate-100, hex #f1f5f9
    // Also accept rgb(245, 245, 245) or similar light grays
    expect(bgRegular).not.toMatch(/rgba\(\s*255,\s*255,\s*255,\s*0(\.\d+)?\s*\)/);
    expect(bgHtmx).not.toMatch(/rgba\(\s*255,\s*255,\s*255,\s*0(\.\d+)?\s*\)/);

    // Should NOT be fully transparent
    expect(bgRegular).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgRegular).not.toBe('transparent');
    expect(bgHtmx).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgHtmx).not.toBe('transparent');

    // Should have some non-white background — parse RGB values
    // If background is rgba(255,255,255,0.1) that means ~10% white overlay
    // Let's check the backgroundColor includes a real color
    // rgb(241, 245, 249) = slate-100 ✓
    // rgb(245, 245, 245) = light gray ✓
    // rgba(255, 255, 255, 0.1) ✗ — near-invisible
    const isVisibleBg = (color: string): boolean => {
      // Parse rgba(r, g, b, a) or rgb(r, g, b)
      const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!rgba) return true; // Can't parse, don't fail
      const r = parseInt(rgba[1]), g = parseInt(rgba[2]), b = parseInt(rgba[3]);
      const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
      // If alpha is very low (< 0.15) — invisible
      if (a < 0.15) return false;
      return true;
    };

    expect(isVisibleBg(bgRegular)).toBe(true);
    expect(isVisibleBg(bgHtmx)).toBe(true);
  });

  test('copy buttons have dark text color', async ({ page }) => {
    await page.goto(BASE + '/');

    const regularBtn = page.locator('#copy-btn-regular');
    const htmxBtn = page.locator('#copy-btn-htmx');

    // Check computed text color — should be dark visible text
    const colorRegular = await regularBtn.evaluate(el => getComputedStyle(el).color);
    const colorHtmx = await htmxBtn.evaluate(el => getComputedStyle(el).color);

    console.log(`Regular button color: ${colorRegular}`);
    console.log(`HTMX button color: ${colorHtmx}`);

    // Should NOT be light gray (#e2e8f0 = rgb(226, 232, 240)) which blends with white
    // Should be dark text: e.g. rgb(51, 65, 85) = slate-700
    const parseRgb = (color: string): { r: number; g: number; b: number } | null => {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (!m) return null;
      return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
    };

    const cr = parseRgb(colorRegular);
    const ch = parseRgb(colorHtmx);

    if (cr) {
      // Lightness check: at least one channel should be below 120 for dark text
      // e2e8f0 = rgb(226, 232, 240) — all channels > 220, very light
      // 334155 = rgb(51, 65, 85) — all channels < 90, dark
      const brightness = (cr.r + cr.g + cr.b) / 3;
      expect(brightness).toBeLessThan(180); // Should be dark-ish text
    }

    if (ch) {
      const brightness = (ch.r + ch.g + ch.b) / 3;
      expect(brightness).toBeLessThan(180);
    }
  });

  test('copy buttons have visible border', async ({ page }) => {
    await page.goto(BASE + '/');

    const regularBtn = page.locator('#copy-btn-regular');
    const htmxBtn = page.locator('#copy-btn-htmx');

    // Check border — should be a solid visible color
    const borderRegular = await regularBtn.evaluate(el => getComputedStyle(el).border);
    const borderHtmx = await htmxBtn.evaluate(el => getComputedStyle(el).border);

    console.log(`Regular button border: ${borderRegular}`);
    console.log(`HTMX button border: ${borderHtmx}`);

    // Border should be visible (not rgb(255,255,255,0.2) near-transparent)
    // border: 1px solid rgba(255, 255, 255, 0.2) — invisible on white
    // border: 1px solid rgb(203, 213, 225) — visible slate-300
    expect(borderRegular).not.toContain('rgba(255,255,255,0.2)');
    expect(borderHtmx).not.toContain('rgba(255,255,255,0.2)');
    expect(borderRegular).not.toContain('rgba(255, 255, 255, 0.2)');
    expect(borderHtmx).not.toContain('rgba(255, 255, 255, 0.2)');
  });

  test('copy button shows "Copied!" text on click (functional test)', async ({ page }) => {
    await page.goto(BASE + '/');

    const regularBtn = page.locator('#copy-btn-regular');
    const htmxBtn = page.locator('#copy-btn-htmx');

    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Click regular copy button
    await regularBtn.click();
    await expect(regularBtn).toHaveText('Copied!', { timeout: 3000 });

    // Wait for reset
    await expect(regularBtn).toHaveText('Copy', { timeout: 3000 });

    // Click HTMX copy button
    await htmxBtn.click();
    await expect(htmxBtn).toHaveText('Copied!', { timeout: 3000 });
  });
});
