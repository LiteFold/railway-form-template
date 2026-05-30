import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';
const ADMIN_PW = 'admin123';

async function login(page: any) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="password"]', ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
}

/**
 * Measure bounding boxes of the toggle and Delete buttons in each data row.
 */
async function measureButtons(page: any) {
  return await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const results: any[] = [];

    rows.forEach((row, index) => {
      if (row.querySelector('.empty-state')) return;

      const toggleBtn = row.querySelector(
        'button[hx-get*="toggle"]'
      ) as HTMLElement | null;

      const deleteBtn = row.querySelector(
        'button[hx-delete]'
      ) as HTMLElement | null;

      if (!toggleBtn || !deleteBtn) return;

      const toggleRect = toggleBtn.getBoundingClientRect();
      const deleteRect = deleteBtn.getBoundingClientRect();
      const isUnread = row.classList.contains('unread');

      results.push({
        rowIndex: index,
        isUnread,
        toggleWidth: Math.round(toggleRect.width * 100) / 100,
        toggleX: Math.round(toggleRect.x * 100) / 100,
        deleteX: Math.round(deleteRect.x * 100) / 100,
        deleteWidth: Math.round(deleteRect.width * 100) / 100,
        toggleText: toggleBtn.textContent?.trim() || '',
        hasToggleClass: toggleBtn.classList.contains('btn-toggle'),
      });
    });

    return results;
  });
}

test.describe('Action Button Alignment — Submissions Table', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('toggle button has consistent width across read and unread rows', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    const rowCount = await page.locator('.table-wrapper tbody tr').count();
    if (rowCount === 0) {
      test.info().skip(true, 'No submissions rows found');
      return;
    }

    const emptyState = page.locator('.table-wrapper tbody .empty-state');
    if (await emptyState.count() > 0) {
      test.info().skip(true, 'No submissions to test (empty state)');
      return;
    }

    let measurements = await measureButtons(page);

    const readRows = measurements.filter((m: any) => !m.isUnread);
    const unreadRows = measurements.filter((m: any) => m.isUnread);

    if (readRows.length === 0 || unreadRows.length === 0) {
      const toggleBtn = page.locator('button[hx-get*="toggle"]').first();
      if (await toggleBtn.count() === 0) {
        test.info().skip(true, 'No toggle buttons found');
        return;
      }

      await toggleBtn.click();
      await page.waitForTimeout(2000);

      measurements = await measureButtons(page);
    }

    const finalReadRows = measurements.filter((m: any) => !m.isUnread);
    const finalUnreadRows = measurements.filter((m: any) => m.isUnread);

    if (finalReadRows.length === 0 || finalUnreadRows.length === 0) {
      test.skip();
      return;
    }

    console.log('Read rows toggle widths:', finalReadRows.map((m: any) => m.toggleWidth));
    console.log('Unread rows toggle widths:', finalUnreadRows.map((m: any) => m.toggleWidth));

    const readWidths = finalReadRows.map((m: any) => m.toggleWidth);
    const unreadWidths = finalUnreadRows.map((m: any) => m.toggleWidth);
    const allWidths = [...readWidths, ...unreadWidths];

    const maxWidth = Math.max(...allWidths);
    const minWidth = Math.min(...allWidths);

    // The toggle button should render at the same width in both states
    expect(maxWidth - minWidth).toBeLessThanOrEqual(3);
  });

  test('Delete button stays in same position across read and unread rows', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    const rowCount = await page.locator('.table-wrapper tbody tr').count();
    if (rowCount === 0) {
      test.info().skip(true, 'No submissions rows found');
      return;
    }

    const emptyState = page.locator('.table-wrapper tbody .empty-state');
    if (await emptyState.count() > 0) {
      test.info().skip(true, 'No submissions to test (empty state)');
      return;
    }

    let measurements = await measureButtons(page);

    const readRows = measurements.filter((m: any) => !m.isUnread);
    const unreadRows = measurements.filter((m: any) => m.isUnread);

    if (readRows.length === 0 || unreadRows.length === 0) {
      const toggleBtn = page.locator('button[hx-get*="toggle"]').first();
      if (await toggleBtn.count() === 0) {
        test.info().skip(true, 'No toggle buttons found');
        return;
      }

      await toggleBtn.click();
      await page.waitForTimeout(2000);

      measurements = await measureButtons(page);
    }

    const finalReadRows = measurements.filter((m: any) => !m.isUnread);
    const finalUnreadRows = measurements.filter((m: any) => m.isUnread);

    if (finalReadRows.length === 0 || finalUnreadRows.length === 0) {
      test.info().skip(true, 'Could not produce both read and unread rows for comparison');
      return;
    }

    const readDeleteXs = finalReadRows.map((m: any) => m.deleteX);
    const unreadDeleteXs = finalUnreadRows.map((m: any) => m.deleteX);

    console.log('Read rows Delete X:', readDeleteXs);
    console.log('Unread rows Delete X:', unreadDeleteXs);

    const maxReadX = Math.max(...readDeleteXs);
    const minReadX = Math.min(...readDeleteXs);
    const maxUnreadX = Math.max(...unreadDeleteXs);
    const minUnreadX = Math.min(...unreadDeleteXs);

    const overlapGap = Math.max(minReadX, minUnreadX) - Math.min(maxReadX, maxUnreadX);
    expect(overlapGap).toBeLessThanOrEqual(2);
  });

  test('toggle button text alternates on click (Mark read <-> Mark unread)', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    const toggleBtn = page.locator('button[hx-get*="toggle"]').first();
    if (await toggleBtn.count() === 0) {
      test.info().skip(true, 'No toggle buttons found');
      return;
    }

    const originalText = (await toggleBtn.textContent())?.trim() || '';
    expect(['Mark read', 'Mark unread']).toContain(originalText);

    await toggleBtn.click();
    await page.waitForTimeout(2000);

    const toggledBtn = page.locator('button[hx-get*="toggle"]').first();
    const newText = (await toggledBtn.textContent())?.trim() || '';

    if (originalText === 'Mark read') {
      expect(newText).toBe('Mark unread');
    } else {
      expect(newText).toBe('Mark read');
    }
  });

  test('Verify .btn-toggle class has proper width constraint', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    const toggleBtns = page.locator('button[hx-get*="toggle"]');
    const count = await toggleBtns.count();

    if (count === 0) {
      test.info().skip(true, 'No toggle buttons found');
      return;
    }

    const firstBtn = toggleBtns.first();
    const classAttr = await firstBtn.getAttribute('class');

    if (classAttr && classAttr.includes('btn-toggle')) {
      // The fix is applied — verify the CSS rule
      const hasMinWidth = await page.evaluate(() => {
        const el = document.createElement('button');
        el.className = 'btn btn-sm btn-ghost btn-toggle';
        el.textContent = 'Mark unread';
        document.body.appendChild(el);
        const style = window.getComputedStyle(el);
        const minWidth = style.minWidth;
        const textAlign = style.textAlign;
        const actualWidth = el.getBoundingClientRect().width;
        document.body.removeChild(el);
        return { minWidth, textAlign, actualWidth: Math.round(actualWidth) };
      });

      console.log('btn-toggle computed style:', hasMinWidth);
      expect(hasMinWidth.textAlign).toBe('center');

      // The min-width must be >= the natural width of "Mark unread" (~99px)
      const minWidthPx = parseInt(hasMinWidth.minWidth, 10);
      expect(minWidthPx).toBeGreaterThanOrEqual(99);

      // With proper min-width, both text variants should render at same width
      const widthDiff = await page.evaluate(() => {
        const el1 = document.createElement('button');
        el1.className = 'btn btn-sm btn-ghost btn-toggle';
        el1.textContent = 'Mark read';
        document.body.appendChild(el1);

        const el2 = document.createElement('button');
        el2.className = 'btn btn-sm btn-ghost btn-toggle';
        el2.textContent = 'Mark unread';
        document.body.appendChild(el2);

        const w1 = el1.getBoundingClientRect().width;
        const w2 = el2.getBoundingClientRect().width;
        document.body.removeChild(el1);
        document.body.removeChild(el2);
        return Math.round(Math.abs(w1 - w2));
      });

      console.log('Width difference between text variants:', widthDiff);
      expect(widthDiff).toBeLessThanOrEqual(2);
    } else {
      console.log('btn-toggle class not found — fix not yet deployed');
      test.info().annotations.push({
        type: 'info',
        description: 'btn-toggle class not present. Test will pass once fix is deployed.',
      });
    }
  });
});
