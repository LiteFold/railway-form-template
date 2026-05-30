import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';
const ADMIN_PW = 'admin123';

async function login(page: any) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="password"]', ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
}

interface TextCenterResult {
  rowIndex: number;
  isUnread: boolean;
  label: string;
  btnCenterX: number;
  textCenterX: number;
  centerDiffPx: number;
  justifyContent: string;
}

async function measureTextCentering(page: any): Promise<TextCenterResult[]> {
  return await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const results: TextCenterResult[] = [];

    rows.forEach((row, index) => {
      if (row.querySelector('.empty-state')) return;

      const toggleBtn = row.querySelector(
        'button[hx-get*="toggle"]'
      ) as HTMLElement | null;

      if (!toggleBtn) return;

      const btnRect = toggleBtn.getBoundingClientRect();
      const btnCenterX = btnRect.left + btnRect.width / 2;
      const isUnread = row.classList.contains('unread');
      const label = toggleBtn.textContent?.trim() || '';
      const style = window.getComputedStyle(toggleBtn);

      let textCenterX = btnCenterX;
      let centerDiffPx = 0;

      if (toggleBtn.childNodes.length > 0) {
        let minLeft = Infinity;
        let maxRight = -Infinity;

        toggleBtn.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0) {
              minLeft = Math.min(minLeft, rect.left);
              maxRight = Math.max(maxRight, rect.right);
            }
          }
        });

        if (minLeft < Infinity && maxRight > -Infinity) {
          textCenterX = minLeft + (maxRight - minLeft) / 2;
          centerDiffPx = Math.abs(btnCenterX - textCenterX);
        }
      }

      results.push({
        rowIndex: index,
        isUnread,
        label,
        btnCenterX: Math.round(btnCenterX * 100) / 100,
        textCenterX: Math.round(textCenterX * 100) / 100,
        centerDiffPx: Math.round(centerDiffPx * 100) / 100,
        justifyContent: style.justifyContent,
      });
    });

    return results;
  });
}

test.describe('Button Text Centering — .btn-toggle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('computed justify-content is center on .btn-toggle buttons', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    const toggleBtns = page.locator('button[hx-get*="toggle"].btn-toggle');
    const count = await toggleBtns.count();

    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const btn = toggleBtns.nth(i);
      const jc = await btn.evaluate((el: HTMLElement) =>
        window.getComputedStyle(el).justifyContent
      );
      expect.soft(jc, `Button ${i}: justify-content is "${jc}"`).toBe('center');
    }
  });

  test('"Mark read" text is visually centered in button on unread rows', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    let results = await measureTextCentering(page);
    const markReadRows = results.filter((r) => r.label === 'Mark read');

    if (markReadRows.length === 0) {
      const toggleBtn = page.locator('button[hx-get*="toggle"]').first();
      if (await toggleBtn.count() === 0) {
        test.skip();
        return;
      }
      await toggleBtn.click();
      await page.waitForTimeout(2000);
      results = await measureTextCentering(page);
    }

    const finalRead = results.filter((r) => r.label === 'Mark read');
    if (finalRead.length === 0) {
      test.skip();
      return;
    }

    for (const r of finalRead) {
      expect.soft(
        r.centerDiffPx,
        `Row ${r.rowIndex}: "${r.label}" center diff ${r.centerDiffPx}px`
      ).toBeLessThanOrEqual(3);
    }
  });

  test('"Mark unread" text is visually centered in button on read rows', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    let results = await measureTextCentering(page);
    const markUnreadRows = results.filter((r) => r.label === 'Mark unread');

    if (markUnreadRows.length === 0) {
      const toggleBtn = page.locator('button[hx-get*="toggle"]').first();
      if (await toggleBtn.count() === 0) {
        test.skip();
        return;
      }
      await toggleBtn.click();
      await page.waitForTimeout(2000);
      results = await measureTextCentering(page);
    }

    const finalUnread = results.filter((r) => r.label === 'Mark unread');
    if (finalUnread.length === 0) {
      test.skip();
      return;
    }

    for (const r of finalUnread) {
      expect.soft(
        r.centerDiffPx,
        `Row ${r.rowIndex}: "${r.label}" center diff ${r.centerDiffPx}px`
      ).toBeLessThanOrEqual(3);
    }
  });

  test('after HTMX toggle, new label stays centered in button', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.table-wrapper');

    const toggleBtn = page.locator('button[hx-get*="toggle"]').first();
    if (await toggleBtn.count() === 0) {
      test.skip();
      return;
    }

    let before = await measureTextCentering(page);
    const beforeRow = before[0];
    if (!beforeRow) {
      test.skip();
      return;
    }
    expect.soft(
      beforeRow.centerDiffPx,
      `Before toggle: "${beforeRow.label}" center diff ${beforeRow.centerDiffPx}px`
    ).toBeLessThanOrEqual(3);

    await toggleBtn.click();
    await page.waitForTimeout(2000);

    let after = await measureTextCentering(page);
    const afterRow = after[0];
    if (!afterRow) {
      test.skip();
      return;
    }

    expect(afterRow.label).not.toBe(beforeRow.label);

    expect.soft(
      afterRow.centerDiffPx,
      `After toggle: "${afterRow.label}" center diff ${afterRow.centerDiffPx}px`
    ).toBeLessThanOrEqual(3);

    expect.soft(afterRow.justifyContent).toBe('center');
  });
});
