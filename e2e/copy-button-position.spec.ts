import { test, expect } from '@playwright/test';

test.describe('Copy Button Position on Embed Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the snippet code blocks to render
    await page.waitForSelector('#snippet-code');
    await page.waitForSelector('#snippet-htmx');
    await page.waitForSelector('#copy-btn-regular');
    await page.waitForSelector('#copy-btn-htmx');
  });

  test('1. regular Copy button is positioned below its code block, right-aligned', async ({ page }) => {
    const codeBlock = page.locator('#snippet-code');
    const copyBtn = page.locator('#copy-btn-regular');

    // Get bounding boxes
    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Button should be BELOW the code block (not overlaid)
    // With flexbox column layout, the button is in normal flow after <pre>
    expect(btnBox!.y).toBeGreaterThan(codeBox!.y + codeBox!.height);

    // Button should be right-aligned to the code block
    // (from align-items: flex-end on the wrapper)
    const btnRight = btnBox!.x + btnBox!.width;
    const codeRight = codeBox!.x + codeBox!.width;
    const rightDiff = Math.abs(btnRight - codeRight);
    expect(rightDiff).toBeLessThanOrEqual(5);
  });

  test('2. HTMX Copy button is positioned below its code block, right-aligned', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn-htmx');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Button should be BELOW the code block
    expect(btnBox!.y).toBeGreaterThan(codeBox!.y + codeBox!.height);

    // Button should be right-aligned to the code block
    const btnRight = btnBox!.x + btnBox!.width;
    const codeRight = codeBox!.x + codeBox!.width;
    const rightDiff = Math.abs(btnRight - codeRight);
    expect(rightDiff).toBeLessThanOrEqual(5);
  });

  test('3. regular Copy button does NOT overlap code text — button is entirely BELOW the pre block', async ({ page }) => {
    const codeBlock = page.locator('#snippet-code');
    const copyBtn = page.locator('#copy-btn-regular');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // The button should be entirely below the code block
    // No overlap at all — button is in normal flow after <pre>
    expect(btnBox!.y).toBeGreaterThan(codeBox!.y + codeBox!.height);
  });

  test('4. HTMX Copy button does NOT overlap code text — button is entirely BELOW the pre block', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn-htmx');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // The button should be entirely below the code block
    expect(btnBox!.y).toBeGreaterThan(codeBox!.y + codeBox!.height);
  });

  test('5. regular Copy button is clickable — shows "Copied!" feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
    await page.goto('/');
    await page.waitForSelector('#copy-btn-regular');

    const btn = page.locator('#copy-btn-regular');
    await expect(btn).toHaveText('Copy');

    // Click the button
    await btn.click();

    // Should show "Copied!" feedback
    await expect(btn).toHaveText('Copied!');

    // Should revert to "Copy" after timeout
    await page.waitForTimeout(2500);
    await expect(btn).toHaveText('Copy');
  });

  test('6. HTMX Copy button is clickable — shows "Copied!" feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
    await page.goto('/');
    await page.waitForSelector('#copy-btn-htmx');

    const btn = page.locator('#copy-btn-htmx');
    await expect(btn).toHaveText('Copy');

    // Click the button
    await btn.click();

    // Should show "Copied!" feedback
    await expect(btn).toHaveText('Copied!');

    // Should revert to "Copy" after timeout
    await page.waitForTimeout(2500);
    await expect(btn).toHaveText('Copy');
  });

  test('7. Copy buttons are clearly separated from code text — no overlap between button and pre text bounding boxes', async ({ page }) => {
    // This test checks that both buttons don't overlap their code text area
    const codeBlocks = [page.locator('#snippet-code'), page.locator('#snippet-htmx')];
    const copyBtns = [page.locator('#copy-btn-regular'), page.locator('#copy-btn-htmx')];

    for (let i = 0; i < 2; i++) {
      const codeBox = await codeBlocks[i].boundingBox();
      const btnBox = await copyBtns[i].boundingBox();

      expect(codeBox).not.toBeNull();
      expect(btnBox).not.toBeNull();

      // The button is in normal flow below the <pre>, so its top edge
      // should be below the entire code block (no overlap)
      expect(btnBox!.y).toBeGreaterThan(codeBox!.y + codeBox!.height);
    }
  });

  test('8. both Copy buttons have correct flexbox layout properties', async ({ page }) => {
    const btns = [
      { locator: page.locator('#copy-btn-regular'), name: 'regular' },
      { locator: page.locator('#copy-btn-htmx'), name: 'htmx' },
    ];

    for (const { locator, name } of btns) {
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
    }
  });

  test('9. .code-block-wrapper uses flexbox layout with column direction and items at flex-end', async ({ page }) => {
    // Verify the structural relationship
    const wrappers = page.locator('.code-block-wrapper');
    const count = await wrappers.count();
    expect(count).toBe(2);

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
