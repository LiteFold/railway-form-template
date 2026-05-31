import { test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';
const ADMIN_PW = 'admin123';

test('debug dropdown CSS', async ({ page }) => {
  // Login
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="password"]', ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
  await page.waitForSelector('.search-bar');

  const data = await page.evaluate(() => {
    const dropdown = document.querySelector('.form-filter') as HTMLElement;
    const input = document.querySelector('.search-bar input') as HTMLElement;

    if (!dropdown || !input) {
      return {
        error: 'missing elements',
        hasDropdown: !!dropdown,
        hasInput: !!input,
        html: document.querySelector('.search-bar')?.innerHTML || 'no search bar',
      };
    }

    const ds = window.getComputedStyle(dropdown);
    const is = window.getComputedStyle(input);

    let cssRules = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules) {
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j] as CSSStyleRule;
            if (rule.selectorText && rule.selectorText.includes('form-filter')) {
              cssRules += `${rule.selectorText} { ${rule.style.cssText} }\n`;
            }
          }
        }
      } catch(e) {
        cssRules += `Sheet ${i} (${sheet.href || 'inline'}): ${e}\n`;
      }
    }

    return {
      dropdownTag: dropdown.tagName,
      dropdownClass: dropdown.className,
      cssRulesFound: cssRules,
      dropdownStyles: {
        paddingTop: ds.paddingTop,
        paddingBottom: ds.paddingBottom,
        borderTopWidth: ds.borderTopWidth,
        borderColor: ds.borderColor,
        borderRadius: ds.borderRadius,
        fontSize: ds.fontSize,
        backgroundColor: ds.backgroundColor,
        height: dropdown.offsetHeight,
      },
      inputStyles: {
        paddingTop: is.paddingTop,
        paddingBottom: is.paddingBottom,
        borderTopWidth: is.borderTopWidth,
        borderColor: is.borderColor,
        borderRadius: is.borderRadius,
        fontSize: is.fontSize,
        backgroundColor: is.backgroundColor,
        height: input.offsetHeight,
      },
    };
  });

  console.log(JSON.stringify(data, null, 2));
});
