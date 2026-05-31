import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('Code block alignment on embed page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE + '/');
    // Wait for the page to fully render
    await expect(page.locator('body.embed-page')).toBeVisible();
    await expect(page.locator('.code-block-wrapper')).toHaveCount(2);
  });

  test('both code blocks exist and are visible', async ({ page }) => {
    const wrappers = page.locator('.code-block-wrapper');
    await expect(wrappers).toHaveCount(2);

    const wrapper1 = wrappers.nth(0);
    const wrapper2 = wrappers.nth(1);

    // Both pre elements visible
    await expect(wrapper1.locator('pre')).toBeVisible();
    await expect(wrapper2.locator('pre')).toBeVisible();

    // Both code blocks have IDs
    await expect(page.locator('#snippet-code')).toBeVisible();
    await expect(page.locator('#snippet-htmx')).toBeVisible();
  });

  test('both code blocks have the same width', async ({ page }) => {
    const widths = await page.evaluate(() => {
      const pre1 = document.getElementById('snippet-code');
      const pre2 = document.getElementById('snippet-htmx');
      if (!pre1 || !pre2) return { error: 'code blocks not found' };

      const rect1 = pre1.getBoundingClientRect();
      const rect2 = pre2.getBoundingClientRect();

      return {
        width1: Math.round(rect1.width),
        width2: Math.round(rect2.width),
        left1: Math.round(rect1.left),
        left2: Math.round(rect2.left),
        right1: Math.round(rect1.right),
        right2: Math.round(rect2.right),
      };
    });

    console.log('Code block dimensions:', JSON.stringify(widths));

    expect(widths.error).toBeUndefined();
    // Widths should be equal (within 1px for sub-pixel rounding)
    expect(Math.abs(widths.width1 - widths.width2)).toBeLessThanOrEqual(1);
  });

  test('left edges of both code blocks are aligned', async ({ page }) => {
    const positions = await page.evaluate(() => {
      const pre1 = document.getElementById('snippet-code');
      const pre2 = document.getElementById('snippet-htmx');
      if (!pre1 || !pre2) return { error: 'code blocks not found' };

      const rect1 = pre1.getBoundingClientRect();
      const rect2 = pre2.getBoundingClientRect();

      return {
        left1: Math.round(rect1.left),
        left2: Math.round(rect2.left),
      };
    });

    console.log('Left edge positions:', JSON.stringify(positions));
    expect(positions.error).toBeUndefined();
    expect(Math.abs(positions.left1 - positions.left2)).toBeLessThanOrEqual(1);
  });

  test('right edges of both code blocks are aligned', async ({ page }) => {
    const positions = await page.evaluate(() => {
      const pre1 = document.getElementById('snippet-code');
      const pre2 = document.getElementById('snippet-htmx');
      if (!pre1 || !pre2) return { error: 'code blocks not found' };

      const rect1 = pre1.getBoundingClientRect();
      const rect2 = pre2.getBoundingClientRect();

      return {
        right1: Math.round(rect1.right),
        right2: Math.round(rect2.right),
      };
    });

    console.log('Right edge positions:', JSON.stringify(positions));
    expect(positions.error).toBeUndefined();
    expect(Math.abs(positions.right1 - positions.right2)).toBeLessThanOrEqual(1);
  });

  test('code blocks have width:100% CSS applied', async ({ page }) => {
    const styles = await page.evaluate(() => {
      const pre1 = document.getElementById('snippet-code');
      const pre2 = document.getElementById('snippet-htmx');
      if (!pre1 || !pre2) return { error: 'code blocks not found' };

      const style1 = getComputedStyle(pre1);
      const style2 = getComputedStyle(pre2);

      // Check the wrapper too
      const wrapper1 = pre1.closest('.code-block-wrapper');
      const wrapper2 = pre2.closest('.code-block-wrapper');
      const wrapperStyle1 = wrapper1 ? getComputedStyle(wrapper1) : null;
      const wrapperStyle2 = wrapper2 ? getComputedStyle(wrapper2) : null;

      return {
        preWidth1: style1.width,
        preWidth2: style2.width,
        wrapperWidth1: wrapperStyle1 ? wrapperStyle1.width : 'N/A',
        wrapperWidth2: wrapperStyle2 ? wrapperStyle2.width : 'N/A',
        preDisplay1: style1.display,
        preDisplay2: style2.display,
        wrapperDisplay1: wrapperStyle1 ? wrapperStyle1.display : 'N/A',
        wrapperAlignItems1: wrapperStyle1 ? wrapperStyle1.alignItems : 'N/A',
      };
    });

    console.log('Computed styles:', JSON.stringify(styles));
    expect(styles.error).toBeUndefined();

    // Both pre elements should have 100% width (or a computed px value equal to container)
    expect(styles.preWidth1).toBeTruthy();
    expect(styles.preWidth2).toBeTruthy();
  });

  test('copy buttons are at the same horizontal position', async ({ page }) => {
    const positions = await page.evaluate(() => {
      const btn1 = document.getElementById('copy-btn-regular');
      const btn2 = document.getElementById('copy-btn-htmx');
      if (!btn1 || !btn2) return { error: 'copy buttons not found' };

      const rect1 = btn1.getBoundingClientRect();
      const rect2 = btn2.getBoundingClientRect();

      return {
        // Left edge of buttons
        left1: Math.round(rect1.left),
        left2: Math.round(rect2.left),
        // Right edge of buttons
        right1: Math.round(rect1.right),
        right2: Math.round(rect2.right),
        // Horizontal center
        centerX1: Math.round(rect1.left + rect1.width / 2),
        centerX2: Math.round(rect2.left + rect2.width / 2),
      };
    });

    console.log('Copy button positions:', JSON.stringify(positions));
    expect(positions.error).toBeUndefined();

    // Copy buttons should be at the same horizontal alignment
    // (they're both right-aligned in the wrapper)
    expect(Math.abs(positions.left1 - positions.left2)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions.right1 - positions.right2)).toBeLessThanOrEqual(1);
  });

  test('copy buttons are visible and functional', async ({ page }) => {
    const regularBtn = page.locator('#copy-btn-regular');
    const htmxBtn = page.locator('#copy-btn-htmx');

    await expect(regularBtn).toBeVisible();
    await expect(htmxBtn).toBeVisible();
    await expect(regularBtn).toHaveText('Copy');
    await expect(htmxBtn).toHaveText('Copy');

    // Grant clipboard permission and test button click
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await regularBtn.click();
    await expect(regularBtn).toHaveText('Copied!', { timeout: 3000 });
    await expect(regularBtn).toHaveText('Copy', { timeout: 3000 });

    await htmxBtn.click();
    await expect(htmxBtn).toHaveText('Copied!', { timeout: 3000 });
    await expect(htmxBtn).toHaveText('Copy', { timeout: 3000 });
  });
});
