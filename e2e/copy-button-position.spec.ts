import { test, expect } from '@playwright/test';

test.describe('Copy Button Position on Embed Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the snippet code block to render
    await page.waitForSelector('#snippet-htmx');
    await page.waitForSelector('#copy-btn');
  });

  test('1. Copy button is positioned below its code block, right-aligned', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn');

    // Get bounding boxes
    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Button should be BELOW the code block (not overlaid)
    // With flexbox column layout, the button is in normal flow after <pre>
    expect(btnBox!.y).toBeGreaterThanOrEqual(codeBox!.y + codeBox!.height);

    // Button should be right-aligned to the code block
    const btnRight = btnBox!.x + btnBox!.width;
    const codeRight = codeBox!.x + codeBox!.width;
    const rightDiff = Math.abs(btnRight - codeRight);
    expect(rightDiff).toBeLessThanOrEqual(5);
  });

  test('2. Copy button does NOT overlap code text — button is entirely BELOW the pre block', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // The button should be entirely below the code block
    expect(btnBox!.y).toBeGreaterThanOrEqual(codeBox!.y + codeBox!.height);
  });

  test('3. Copy button is clickable — shows "Copied!" feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
    await page.goto('/');
    await page.waitForSelector('#copy-btn');

    const btn = page.locator('#copy-btn');
    await expect(btn).toHaveText('Copy');

    // Click the button
    await btn.click();

    // Should show "Copied!" feedback
    await expect(btn).toHaveText('Copied!');

    // Should revert to "Copy" after timeout
    await page.waitForTimeout(2500);
    await expect(btn).toHaveText('Copy');
  });

  test('4. Copy button is clearly separated from code text — no overlap between button and pre text bounding boxes', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // The button is in normal flow below the <pre>, so its top edge
    // should be below the entire code block (no overlap)
    expect(btnBox!.y).toBeGreaterThanOrEqual(codeBox!.y + codeBox!.height);
  });

  test('5. Copy button has correct flexbox layout properties', async ({ page }) => {
    const locator = page.locator('#copy-btn');

    // Button should be in normal flow (not absolute positioned)
    const position = await locator.evaluate(el => window.getComputedStyle(el).position);
    expect(position).toBe('static');

    // Parent .code-block-wrapper should have display: flex
    const parent = locator.locator('..');
    const parentDisplay = await parent.evaluate(el => window.getComputedStyle(el).display);
    expect(parentDisplay).toBe('flex');

    // Verify DOM order: <pre> should come before .copy-btn inside the wrapper
    const wrapper = locator.locator('..');
    const preCount = await wrapper.locator('pre').count();
    expect(preCount).toBe(1);
  });

  test('6. .code-block-wrapper uses flexbox layout with column direction and items at flex-end', async ({ page }) => {
    // Verify the structural relationship
    const wrappers = page.locator('.code-block-wrapper');
    const count = await wrappers.count();
    expect(count).toBe(1);

    for (let i = 0; i < count; i++) {
      const wrapper = wrappers.nth(i);

      // Check flexbox properties
      const display = await wrapper.evaluate(el => window.getComputedStyle(el).display);
      expect(display).toBe('flex');

      const flexDirection = await wrapper.evaluate(el => window.getComputedStyle(el).flexDirection);
      expect(flexDirection).toBe('column');

      const alignItems = await wrapper.evaluate(el => window.getComputedStyle(el).alignItems);
      expect(alignItems).toBe('flex-end');

      // Each wrapper should contain a <pre> and a .copy-btn
      const hasPre = await wrapper.locator('pre').count();
      const hasBtn = await wrapper.locator('.copy-btn').count();
      expect(hasPre).toBe(1);
      expect(hasBtn).toBe(1);

      // Verify DOM order: <pre> comes before .copy-btn
      const preEl = wrapper.locator('pre');
      const btnEl = wrapper.locator('.copy-btn');
      const preLoc = await preEl.evaluate(el => {
        const parent = el.parentElement!;
        return Array.from(parent.children).indexOf(el);
      });
      const btnLoc = await btnEl.evaluate(el => {
        const parent = el.parentElement!;
        return Array.from(parent.children).indexOf(el);
      });
      expect(btnLoc).toBeGreaterThan(preLoc);
    }
  });
});
