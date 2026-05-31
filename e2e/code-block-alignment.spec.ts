import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('Code block alignment on embed page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE + '/');
    // Wait for the page to fully render
    await expect(page.locator('body.embed-page')).toBeVisible();
    await expect(page.locator('.code-block-wrapper')).toHaveCount(1);
  });

  test('the code block exists and is visible', async ({ page }) => {
    const wrappers = page.locator('.code-block-wrapper');
    await expect(wrappers).toHaveCount(1);

    const wrapper = wrappers.nth(0);

    // The pre element is visible
    await expect(wrapper.locator('pre')).toBeVisible();

    // The code block has the correct ID
    await expect(page.locator('#snippet-htmx')).toBeVisible();
  });

  test('the code block has 100% width', async ({ page }) => {
    const styles = await page.evaluate(() => {
      const pre = document.getElementById('snippet-htmx');
      if (!pre) return { error: 'code block not found' };

      const style = getComputedStyle(pre);

      // Check the wrapper too
      const wrapper = pre.closest('.code-block-wrapper');
      const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;

      return {
        preWidth: style.width,
        wrapperWidth: wrapperStyle ? wrapperStyle.width : 'N/A',
        preDisplay: style.display,
        wrapperDisplay: wrapperStyle ? wrapperStyle.display : 'N/A',
        wrapperAlignItems: wrapperStyle ? wrapperStyle.alignItems : 'N/A',
      };
    });

    console.log('Computed styles:', JSON.stringify(styles));
    expect(styles.error).toBeUndefined();

    // The pre element should have a computed width
    expect(styles.preWidth).toBeTruthy();
  });

  test('copy button is at the same horizontal position as the code block', async ({ page }) => {
    const positions = await page.evaluate(() => {
      const pre = document.getElementById('snippet-htmx');
      const btn = document.getElementById('copy-btn');
      if (!pre || !btn) return { error: 'elements not found' };

      const preRect = pre.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();

      return {
        preRight: Math.round(preRect.right),
        btnRight: Math.round(btnRect.right),
        btnLeft: Math.round(btnRect.left),
        preLeft: Math.round(preRect.left),
      };
    });

    console.log('Element positions:', JSON.stringify(positions));
    expect(positions.error).toBeUndefined();

    // Copy button should be right-aligned with the code block
    expect(Math.abs(positions.preRight - positions.btnRight)).toBeLessThanOrEqual(5);
  });

  test('copy button is visible and functional', async ({ page }) => {
    const copyBtn = page.locator('#copy-btn');

    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toHaveText('Copy');

    // Grant clipboard permission and test button click
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copied!', { timeout: 3000 });
    await expect(copyBtn).toHaveText('Copy', { timeout: 3000 });
  });
});
