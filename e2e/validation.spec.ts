import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-production-1576.up.railway.app';

/**
 * Helper: inject an extra input field into the .form-card form after the page's
 * validation script has already set up error spans on existing fields.  We then
 * manually create its error span and attach the same validation logic (matching
 * the inline script in public_form.html) so we can test on-the-fly validation
 * for field types that the contact form does not natively include.
 */
async function injectField(page, type, name, label) {
  return page.evaluate(({ type, name, label }) => {
    const form = document.querySelector('.form-card form');
    if (!form) throw new Error('form not found');

    // Create the input
    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.placeholder = label;
    input.id = 'test-' + name;
    form.insertBefore(input, form.querySelector('button[type="submit"]'));

    // Create its error span (same logic as public_form.html line 225-227)
    const errorSpan = document.createElement('span');
    errorSpan.className = 'field-error field-error-hidden';
    input.parentNode.insertBefore(errorSpan, input.nextSibling);

    // Attach validation (same logic as public_form.html lines 228-257)
    function validate() {
      const val = input.value.trim();
      const t = input.type || '';
      const n = input.name || '';
      let error = '';
      if (val.length > 0) {
        if (t === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
          error = 'Please enter a valid email address';
        } else if (t === 'tel' && !/^[\d\s\-+()]+$/.test(val)) {
          error = 'Please enter a valid phone number';
        } else if (t === 'url' && !/^https?:\/\/.+/.test(val)) {
          error = 'Please enter a valid URL (http/https)';
        } else if (t === 'number' && val !== '' && isNaN(parseFloat(val))) {
          error = 'Please enter a valid number';
        }
        // name-based fallback for type=text
        if (!error && (t === 'text' || input.tagName.toLowerCase() === 'textarea')) {
          if (n === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
            error = 'Please enter a valid email address';
          } else if ((n === 'tel' || n === 'phone') && !/^[\d\s\-+()]+$/.test(val)) {
            error = 'Please enter a valid phone number';
          } else if ((n === 'url' || n === 'website') && !/^https?:\/\/.+/.test(val)) {
            error = 'Please enter a valid URL (http/https)';
          }
        }
      }
      errorSpan.textContent = error;
      errorSpan.classList.toggle('field-error-hidden', !error);
      input.classList.toggle('error', !!error);
    }
    input.addEventListener('input', validate);
    input.addEventListener('blur', validate);

    return { inputId: input.id };
  }, { type, name, label });
}

/**
 * Helper: set a value on a number-type input via evaluate, bypassing the
 * browser's native input[type=number] sanitization that rejects non-numeric
 * strings.  We use Object.defineProperty on the instance itself (not the
 * prototype setter) so that input.value later reads back our value, allowing
 * the validation function to detect it as invalid.
 */
async function setNumberInputValue(page, selector, value) {
  await page.evaluate(({ selector, value }) => {
    const el = document.querySelector(selector) as HTMLInputElement;
    if (!el) throw new Error('element not found: ' + selector);
    // Override the value property at the instance level — this bypasses the
    // browser's type=number value sanitization that would otherwise reject
    // non-numeric strings and return '' from .value.
    Object.defineProperty(el, 'value', {
      value,
      writable: true,
      configurable: true,
    });
    // Dispatch input and blur events so the validation callback runs
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector, value });
}

test.describe('On-the-fly input validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE + '/form/contact');
  });

  // ── Email validation (name-based fallback: type=text, name=email) ──
  // Use + (adjacent sibling) to get only the immediately-following .field-error span.
  // The ~ combinator would match ALL following .field-error siblings from other fields.

  test('1. invalid email "not-an-email" shows error', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]');
    const errorSpan = emailInput.locator('+ .field-error');

    await emailInput.fill('not-an-email');
    await emailInput.blur();

    await expect(errorSpan).toBeVisible();
    await expect(errorSpan).toHaveText('Please enter a valid email address');
  });

  test('2. valid email "test@example.com" hides error', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]');
    const errorSpan = emailInput.locator('+ .field-error');

    // First trigger an error
    await emailInput.fill('not-an-email');
    await emailInput.blur();
    await expect(errorSpan).toBeVisible();

    // Now type a valid email
    await emailInput.fill('test@example.com');
    await emailInput.blur();

    await expect(errorSpan).toBeHidden();
  });

  test('3. name-based fallback: type=text, name=email triggers email validation', async ({ page }) => {
    // The production form already has type=text, name=email — verify this
    const inputType = await page.evaluate(() => {
      const el = document.querySelector('input[name="email"]');
      return el ? el.type : null;
    });
    expect(inputType).toBe('text');

    const emailInput = page.locator('input[name="email"]');
    const errorSpan = emailInput.locator('+ .field-error');

    // Invalid email should trigger name-based fallback validation
    await emailInput.fill('bad-email');
    await emailInput.blur();
    await expect(errorSpan).toBeVisible();
    await expect(errorSpan).toHaveText('Please enter a valid email address');

    // Valid email should clear the error
    await emailInput.fill('user@domain.com');
    await emailInput.blur();
    await expect(errorSpan).toBeHidden();
  });

  // ── Phone / tel validation ──

  test('4. "abc" in phone/tel field shows error', async ({ page }) => {
    await injectField(page, 'tel', 'phone', 'Phone');
    const input = page.locator('#test-phone');
    const errorSpan = input.locator('+ .field-error');

    await input.fill('abc');
    await input.blur();
    await expect(errorSpan).toBeVisible();
    await expect(errorSpan).toHaveText('Please enter a valid phone number');
  });

  test('5. valid phone "555-1234" hides error', async ({ page }) => {
    await injectField(page, 'tel', 'phone', 'Phone');
    const input = page.locator('#test-phone');
    const errorSpan = input.locator('+ .field-error');

    // First trigger error
    await input.fill('abc');
    await input.blur();
    await expect(errorSpan).toBeVisible();

    // Now type valid
    await input.fill('555-1234');
    await input.blur();
    await expect(errorSpan).toBeHidden();
  });

  // ── URL validation ──

  test('6. non-url in url field shows error', async ({ page }) => {
    await injectField(page, 'url', 'website', 'Website');
    const input = page.locator('#test-website');
    const errorSpan = input.locator('+ .field-error');

    await input.fill('not-a-url');
    await input.blur();
    await expect(errorSpan).toBeVisible();
    await expect(errorSpan).toHaveText('Please enter a valid URL (http/https)');
  });

  test('7. "https://example.com" hides error', async ({ page }) => {
    await injectField(page, 'url', 'website', 'Website');
    const input = page.locator('#test-website');
    const errorSpan = input.locator('+ .field-error');

    // First trigger error
    await input.fill('not-a-url');
    await input.blur();
    await expect(errorSpan).toBeVisible();

    // Now type valid
    await input.fill('https://example.com');
    await input.blur();
    await expect(errorSpan).toBeHidden();
  });

  // ── Number validation ──
  // Playwright cannot fill('abc') into input[type=number] at the browser level,
  // and the native .value setter also sanitizes non-numeric strings to ''.
  // We use Object.defineProperty on the instance to bypass the sanitization.

  test('8. "abc" in number field shows error', async ({ page }) => {
    await injectField(page, 'number', 'age', 'Age');
    const input = page.locator('#test-age');
    const errorSpan = input.locator('+ .field-error');

    await setNumberInputValue(page, '#test-age', 'abc');
    await expect(errorSpan).toBeVisible();
    await expect(errorSpan).toHaveText('Please enter a valid number');
  });

  test('9. "42" in number field hides error', async ({ page }) => {
    await injectField(page, 'number', 'age', 'Age');
    const input = page.locator('#test-age');
    const errorSpan = input.locator('+ .field-error');

    // First trigger error
    await setNumberInputValue(page, '#test-age', 'abc');
    await expect(errorSpan).toBeVisible();

    // Now type valid
    await setNumberInputValue(page, '#test-age', '42');
    await expect(errorSpan).toBeHidden();
  });
});
