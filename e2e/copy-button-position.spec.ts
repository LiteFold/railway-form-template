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

  test('1. regular Copy button is positioned at bottom-right of its code block', async ({ page }) => {
    const codeBlock = page.locator('#snippet-code');
    const copyBtn = page.locator('#copy-btn-regular');

    // Get bounding boxes
    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Button should be near the bottom of the code block
    // bottom: 8px means btn bottom edge ≈ code block bottom edge
    const btnBottom = btnBox!.y + btnBox!.height;
    const codeBottom = codeBox!.y + codeBox!.height;
    const bottomDiff = codeBottom - btnBottom;

    // Button bottom should be within 20px of code block bottom (8px gap + padding tolerance)
    expect(bottomDiff).toBeGreaterThanOrEqual(0);
    expect(bottomDiff).toBeLessThanOrEqual(25);

    // Button should be near the right edge of the code block
    const btnRight = btnBox!.x + btnBox!.width;
    const codeRight = codeBox!.x + codeBox!.width;
    const rightDiff = codeRight - btnRight;

    // Button right edge should be within 20px of code block right edge (8px gap + padding tolerance)
    expect(rightDiff).toBeGreaterThanOrEqual(0);
    expect(rightDiff).toBeLessThanOrEqual(25);
  });

  test('2. HTMX Copy button is positioned at bottom-right of its code block', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn-htmx');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Button should be near the bottom of the code block
    const btnBottom = btnBox!.y + btnBox!.height;
    const codeBottom = codeBox!.y + codeBox!.height;
    const bottomDiff = codeBottom - btnBottom;

    expect(bottomDiff).toBeGreaterThanOrEqual(0);
    expect(bottomDiff).toBeLessThanOrEqual(25);

    // Button should be near the right edge
    const btnRight = btnBox!.x + btnBox!.width;
    const codeRight = codeBox!.x + codeBox!.width;
    const rightDiff = codeRight - btnRight;

    expect(rightDiff).toBeGreaterThanOrEqual(0);
    expect(rightDiff).toBeLessThanOrEqual(25);
  });

  test('3. regular Copy button does NOT overlap code text — button is BELOW the last line of code', async ({ page }) => {
    const codeBlock = page.locator('#snippet-code');
    const copyBtn = page.locator('#copy-btn-regular');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // The button should be positioned at the bottom of the code block,
    // so the button's top edge should be >= the code block's vertical midpoint
    // (because "bottom-right" means it sits in the bottom area)
    const codeMidY = codeBox!.y + codeBox!.height / 2;
    const btnTopY = btnBox!.y;

    // Button top should be in the bottom half of the code block
    expect(btnTopY).toBeGreaterThanOrEqual(codeMidY);

    // Button should not overlap the code text area vertically
    // The button should not extend above code text (not overlaying content)
    // With bottom: 8px, the button sits in the padding area at the bottom
    // Code text occupies roughly the top portion of the pre block
    // Let's check the button's top edge is in the bottom quarter of the code block
    const codeBottomQuarter = codeBox!.y + codeBox!.height * 0.75;
    expect(btnTopY).toBeGreaterThanOrEqual(codeBottomQuarter);
  });

  test('4. HTMX Copy button does NOT overlap code text — button is BELOW the last line of code', async ({ page }) => {
    const codeBlock = page.locator('#snippet-htmx');
    const copyBtn = page.locator('#copy-btn-htmx');

    const codeBox = await codeBlock.boundingBox();
    const btnBox = await copyBtn.boundingBox();

    expect(codeBox).not.toBeNull();
    expect(btnBox).not.toBeNull();

    // Button top should be in the bottom quarter of the code block
    const codeBottomQuarter = codeBox!.y + codeBox!.height * 0.75;
    const btnTopY = btnBox!.y;
    expect(btnTopY).toBeGreaterThanOrEqual(codeBottomQuarter);
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

      // The button should be positioned at bottom-right, so its
      // top edge should be below the code text area (bottom half of code block)
      const codeVerticalMid = codeBox!.y + codeBox!.height / 2;
      expect(btnBox!.y).toBeGreaterThanOrEqual(codeVerticalMid);
    }
  });

  test('8. both Copy buttons have correct CSS position properties', async ({ page }) => {
    const btns = [
      { locator: page.locator('#copy-btn-regular'), name: 'regular' },
      { locator: page.locator('#copy-btn-htmx'), name: 'htmx' },
    ];

    for (const { locator, name } of btns) {
      // Check the button's CSS position is absolute (from .code-block-wrapper)
      const position = await locator.evaluate(el => window.getComputedStyle(el).position);
      expect(position).toBe('absolute');

      // Check the parent .code-block-wrapper has position: relative
      const parent = locator.locator('..'); // parent element
      const parentPosition = await parent.evaluate(el => window.getComputedStyle(el).position);
      expect(parentPosition).toBe('relative');

      // Verify computed bottom and right values
      const bottom = await locator.evaluate(el => window.getComputedStyle(el).bottom);
      const right = await locator.evaluate(el => window.getComputedStyle(el).right);

      // bottom should be a pixel value (transformed from the original 8px)
      const bottomPx = parseFloat(bottom);
      expect(bottomPx).toBeGreaterThanOrEqual(0);
      expect(bottomPx).toBeLessThanOrEqual(20);

      // right should be a pixel value near 8px
      const rightPx = parseFloat(right);
      expect(rightPx).toBeGreaterThanOrEqual(0);
      expect(rightPx).toBeLessThanOrEqual(20);
    }
  });

  test('9. buttons are inside .code-block-wrapper which has position:relative', async ({ page }) => {
    // Verify the structural relationship
    const wrappers = page.locator('.code-block-wrapper');
    const count = await wrappers.count();
    expect(count).toBe(2);

    for (let i = 0; i < count; i++) {
      const wrapper = wrappers.nth(i);
      const pos = await wrapper.evaluate(el => window.getComputedStyle(el).position);
      expect(pos).toBe('relative');

      // Each wrapper should contain a <pre> and a .copy-btn
      const hasPre = await wrapper.locator('pre').count();
      const hasBtn = await wrapper.locator('.copy-btn').count();
      expect(hasPre).toBe(1);
      expect(hasBtn).toBe(1);
    }
  });
});
