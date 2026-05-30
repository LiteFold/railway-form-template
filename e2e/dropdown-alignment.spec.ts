import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';
const ADMIN_PW = 'admin123';

test.describe('Dropdown / Search Bar Visual Alignment', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the page (handles cookies/session properly in browser context)
    await page.goto(`${BASE}/admin/login`);
    await page.fill('input[name="password"]', ADMIN_PW);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
  });

  /**
   * Measure computed styles and bounding boxes for both the form filter
   * dropdown and the search input.
   */
  async function measureAlignment(page: any) {
    return await page.evaluate(() => {
      const dropdown = document.querySelector('.form-filter') as HTMLElement | null;
      const searchInput = document.querySelector('.search-bar input') as HTMLElement | null;

      if (!dropdown || !searchInput) {
        return { error: 'Elements not found', hasDropdown: !!dropdown, hasSearchInput: !!searchInput };
      }

      const dropStyle = window.getComputedStyle(dropdown);
      const inputStyle = window.getComputedStyle(searchInput);
      const dropRect = dropdown.getBoundingClientRect();
      const inputRect = searchInput.getBoundingClientRect();

      return {
        // Height and position
        dropdownHeight: Math.round(dropRect.height * 100) / 100,
        inputHeight: Math.round(inputRect.height * 100) / 100,
        dropdownTop: Math.round(dropRect.top * 100) / 100,
        inputTop: Math.round(inputRect.top * 100) / 100,
        dropdownBottom: Math.round(dropRect.bottom * 100) / 100,
        inputBottom: Math.round(inputRect.bottom * 100) / 100,

        // Padding
        dropdownPaddingTop: dropStyle.paddingTop,
        inputPaddingTop: inputStyle.paddingTop,
        dropdownPaddingRight: dropStyle.paddingRight,
        inputPaddingRight: inputStyle.paddingRight,
        dropdownPaddingBottom: dropStyle.paddingBottom,
        inputPaddingBottom: inputStyle.paddingBottom,
        dropdownPaddingLeft: dropStyle.paddingLeft,
        inputPaddingLeft: inputStyle.paddingLeft,

        // Border
        dropdownBorderTopWidth: dropStyle.borderTopWidth,
        inputBorderTopWidth: inputStyle.borderTopWidth,
        dropdownBorderColor: dropStyle.borderColor,
        inputBorderColor: inputStyle.borderColor,
        dropdownBorderStyle: dropStyle.borderStyle,
        inputBorderStyle: inputStyle.borderStyle,

        // Border-radius
        dropdownBorderRadius: dropStyle.borderRadius,
        inputBorderRadius: inputStyle.borderRadius,

        // Font
        dropdownFontSize: dropStyle.fontSize,
        inputFontSize: inputStyle.fontSize,
        dropdownLineHeight: dropStyle.lineHeight,
        inputLineHeight: inputStyle.lineHeight,

        // Background
        dropdownBackground: dropStyle.backgroundColor,
        inputBackground: inputStyle.backgroundColor,

        // Box sizing
        dropdownBoxSizing: dropStyle.boxSizing,
        inputBoxSizing: inputStyle.boxSizing,
      };
    });
  }

  test('both dropdown and search input exist on the page', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const dropdown = page.locator('select.form-filter');
    const searchInput = page.locator('.search-bar input');

    await expect(dropdown).toBeVisible();
    await expect(searchInput).toBeVisible();
  });

  test('dropdown and search input have matching height (within 2px)', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({
        type: 'warn',
        description: m.error,
      });
      // If no dropdown class, check for fallback — this indicates fix not deployed
      if (!m.hasDropdown) {
        test.info().annotations.push({
          type: 'info',
          description: '.form-filter class not found — fix may not be deployed yet',
        });
      }
      test.skip();
      return;
    }

    const heightDiff = Math.abs(m.dropdownHeight - m.inputHeight);
    console.log('Dropdown height:', m.dropdownHeight, 'px');
    console.log('Input height:', m.inputHeight, 'px');
    console.log('Height difference:', heightDiff, 'px');

    expect(heightDiff).toBeLessThanOrEqual(2);
  });

  test('dropdown and search input have matching padding', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({ type: 'warn', description: m.error });
      test.skip();
      return;
    }

    console.log('Dropdown padding:', m.dropdownPaddingTop, m.dropdownPaddingRight, m.dropdownPaddingBottom, m.dropdownPaddingLeft);
    console.log('Input padding:', m.inputPaddingTop, m.inputPaddingRight, m.inputPaddingBottom, m.inputPaddingLeft);

    expect(m.dropdownPaddingTop).toBe(m.inputPaddingTop);
    expect(m.dropdownPaddingRight).toBe(m.inputPaddingRight);
    expect(m.dropdownPaddingBottom).toBe(m.inputPaddingBottom);
    expect(m.dropdownPaddingLeft).toBe(m.inputPaddingLeft);
  });

  test('dropdown and search input have matching border', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({ type: 'warn', description: m.error });
      test.skip();
      return;
    }

    console.log('Dropdown border-top-width:', m.dropdownBorderTopWidth, 'color:', m.dropdownBorderColor, 'style:', m.dropdownBorderStyle);
    console.log('Input border-top-width:', m.inputBorderTopWidth, 'color:', m.inputBorderColor, 'style:', m.inputBorderStyle);

    expect(m.dropdownBorderTopWidth).toBe(m.inputBorderTopWidth);
    expect(m.dropdownBorderColor).toBe(m.inputBorderColor);
    expect(m.dropdownBorderStyle).toBe(m.inputBorderStyle);
  });

  test('dropdown and search input have matching border-radius', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({ type: 'warn', description: m.error });
      test.skip();
      return;
    }

    console.log('Dropdown border-radius:', m.dropdownBorderRadius);
    console.log('Input border-radius:', m.inputBorderRadius);

    // Extract the first value (top-left) for comparison
    const dropRadius = m.dropdownBorderRadius.split(' ')[0];
    const inputRadius = m.inputBorderRadius.split(' ')[0];

    expect(dropRadius).toBe(inputRadius);
  });

  test('dropdown and search input have matching font-size', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({ type: 'warn', description: m.error });
      test.skip();
      return;
    }

    console.log('Dropdown font-size:', m.dropdownFontSize);
    console.log('Input font-size:', m.inputFontSize);

    expect(m.dropdownFontSize).toBe(m.inputFontSize);
  });

  test('dropdown and search input sit on the same baseline (same top position within 2px)', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({ type: 'warn', description: m.error });
      test.skip();
      return;
    }

    // Both should have the same top position and bottom position (same height),
    // or at minimum the same top. Since search-bar uses align-items: center,
    // and they should have the same height, their tops should match.
    const topDiff = Math.abs(m.dropdownTop - m.inputTop);
    console.log('Dropdown top:', m.dropdownTop, 'Input top:', m.inputTop, 'Diff:', topDiff);

    expect(topDiff).toBeLessThanOrEqual(2);
  });

  test('dropdown has white background color', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.search-bar');

    const m = await measureAlignment(page);

    if (m.error) {
      test.info().annotations.push({ type: 'warn', description: m.error });
      test.skip();
      return;
    }

    console.log('Dropdown background:', m.dropdownBackground);
    console.log('Input background:', m.inputBackground);

    // Both should have a white-ish background (rgba or named)
    const isWhite = (bg: string) => bg === 'rgb(255, 255, 255)' || bg === 'rgba(255, 255, 255, 1)' || bg === '#fff' || bg === '#ffffff';
    expect(isWhite(m.dropdownBackground)).toBe(true);
  });
});
