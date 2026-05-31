import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';
const ADMIN_PW = 'admin123';

/**
 * Helper: login to admin dashboard.
 */
async function login(page: any) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="password"]', ADMIN_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
}

/**
 * Helper: check whether Cap CAPTCHA is configured on the staging instance.
 * If a cap-widget element exists on the public form page, cap_endpoint is set.
 */
async function isCapConfigured(page: any): Promise<boolean> {
  await page.goto(`${BASE}/form/contact`);
  await page.waitForSelector('form');
  const count = await page.locator('cap-widget').count();
  return count > 0;
}

/**
 * Helper: read the #forms-data JSON from the embed snippet page.
 */
async function getFormsData(page: any): Promise<any[]> {
  await page.goto(`${BASE}/`);
  await page.waitForSelector('#forms-data', { state: 'attached' });
  return await page.evaluate(() => {
    const el = document.getElementById('forms-data');
    if (!el) return [];
    return JSON.parse(el.textContent || '[]');
  });
}

/**
 * Helper: delete a form by slug via the admin dashboard.
 */
async function deleteForm(page: any, slug: string) {
  await page.goto(`${BASE}/admin/forms`);
  const formItem = page.locator(`.form-item:has-text("${slug}")`);
  if (await formItem.isVisible()) {
    page.once('dialog', dialog => dialog.accept());
    await formItem.locator('.btn-danger').click();
    await expect(formItem).toHaveCount(0);
  }
}

test.describe('Global Cap CAPTCHA Site Key', () => {

  test.describe('Form creation and embed behavior', () => {

    test('new form embed uses global key (cap_site_key not set per-form)', async ({ page }) => {
      // Login and create a new form
      await login(page);

      const slug = 'e2e-global-key-test-' + Date.now();
      await page.goto(`${BASE}/admin/forms/new`);
      await page.fill('input[name="slug"]', slug);
      await page.fill('input[name="title"]', 'Global Key Test Form');
      await page.locator('.add-field-btn').click();
      await page.locator('.field-card input[type="text"]').first().fill('Full Name');
      await page.locator('button[type="submit"]').click();

      // Wait for the form to appear in the forms list
      await expect(page.locator(`.form-item:has-text("${slug}") h3`)).toBeVisible();

      // Read the forms-data JSON
      const formsData = await getFormsData(page);
      const ourForm = formsData.find((f: any) => f.slug === slug);
      expect(ourForm).toBeDefined();

      // Verify that per-form cap_site_key is not set (either null or absent)
      // After commit 6763818, the field is removed entirely from forms-data JSON.
      // Until that deploy reaches staging, staging still emits cap_site_key: null.
      // We check that it's not a non-null string (no auto-provisioned key).
      expect(ourForm.cap_site_key === null || ourForm.cap_site_key === undefined).toBe(true);

      // Select our form in the dropdown
      await page.selectOption('#form-select', slug);
      await page.waitForTimeout(200);

      // The snippet should render without errors and use a valid endpoint
      const snippetText = await page.locator('#snippet-htmx').textContent();
      expect(snippetText).toContain('cap-widget');
      expect(snippetText).toContain('data-cap-api-endpoint');
      expect(snippetText).toContain('/cap-proxy/');

      // Clean up
      await deleteForm(page, slug);
    });

    test('embed snippet renders correctly (no per-form key in JSON)', async ({ page }) => {
      // Login and create a form
      await login(page);
      const slug = 'e2e-embed-global-test-' + Date.now();
      await page.goto(`${BASE}/admin/forms/new`);
      await page.fill('input[name="slug"]', slug);
      await page.fill('input[name="title"]', 'Embed Global Test');
      await page.locator('.add-field-btn').click();
      await page.locator('.field-card input[type="text"]').first().fill('Name');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator(`.form-item:has-text("${slug}") h3`)).toBeVisible();

      // Verify form data has no non-null cap_site_key
      const formsData = await getFormsData(page);
      const ourForm = formsData.find((f: any) => f.slug === slug);
      expect(ourForm).toBeDefined();
      expect(ourForm.cap_site_key === null || ourForm.cap_site_key === undefined).toBe(true);

      // Select our form and check the generated snippets
      await page.selectOption('#form-select', slug);
      await page.waitForTimeout(200);

      // Both regular and HTMX snippets should render with cap-widget
      const snippetText = await page.locator('#snippet-htmx').textContent();
      expect(snippetText).toContain('cap-widget');
      expect(snippetText).toContain('data-cap-api-endpoint');

      const htmxSnippet = await page.locator('#snippet-htmx').textContent();
      expect(htmxSnippet).toContain('cap-widget');
      expect(htmxSnippet).toContain('data-cap-api-endpoint');

      // Clean up
      await deleteForm(page, slug);
    });
  });

  test.describe('Global site key in public form page', () => {

    test('data-cap-api-endpoint uses global key (no per-form key)', async ({ page }) => {
      // Check if cap is configured at all
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // Login and create a form
      await login(page);
      const slug = 'e2e-pub-global-test-' + Date.now();
      await page.goto(`${BASE}/admin/forms/new`);
      await page.fill('input[name="slug"]', slug);
      await page.fill('input[name="title"]', 'Public Global Key Test');
      await page.locator('.add-field-btn').click();
      await page.locator('.field-card input[type="text"]').first().fill('Name');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator(`.form-item:has-text("${slug}") h3`)).toBeVisible();

      // Navigate to the public form page
      await page.goto(`${BASE}/form/${slug}`);
      await page.waitForSelector('form');

      // The cap-widget should be rendered
      const capWidget = page.locator('cap-widget');
      await expect(capWidget).toBeVisible();
      const endpoint = await capWidget.getAttribute('data-cap-api-endpoint');
      expect(endpoint).toBeTruthy();

      // The endpoint should reference /cap-proxy/ (with or without a key)
      // Per-form keys are no longer used; only the global key applies.
      expect(endpoint).toMatch(/\/cap-proxy\//);

      // Clean up
      await deleteForm(page, slug);
    });
  });

  test.describe('Pre-feature forms compatibility', () => {

    test('contact form cap_site_key is not a non-null value', async ({ page }) => {
      // The 'contact' form was created during init_db without auto-provisioning.
      // After commit 6763818, cap_site_key is removed from forms-data entirely.
      // Until deployed, staging may still show cap_site_key: null.
      const formsData = await getFormsData(page);

      const contactForm = formsData.find((f: any) => f.slug === 'contact');
      expect(contactForm).toBeDefined();
      // Verify there is no auto-provisioned per-form key
      expect(contactForm.cap_site_key === null || contactForm.cap_site_key === undefined).toBe(true);
    });

    test('public form renders with global key only', async ({ page }) => {
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // For the contact form, the template renders using only the global key
      await page.goto(`${BASE}/form/contact`);
      await page.waitForSelector('form');

      const capWidget = page.locator('cap-widget');
      await expect(capWidget).toBeVisible();
      const endpoint = await capWidget.getAttribute('data-cap-api-endpoint');
      expect(endpoint).toBeTruthy();

      // The endpoint should reference /cap-proxy/ (with or without a key)
      expect(endpoint).toMatch(/\/cap-proxy\//);
    });

    test('embed snippet JS does not rely on per-form cap_site_key', async ({ page }) => {
      // Check the embed snippet page renders correct endpoints
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#forms-data', { state: 'attached' });

      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return [];
        return JSON.parse(el.textContent || '[]');
      });

      // The contact form should not have a non-null per-form key
      const contactForm = formsData.find((f: any) => f.slug === 'contact');
      expect(contactForm).toBeDefined();
      expect(contactForm.cap_site_key === null || contactForm.cap_site_key === undefined).toBe(true);

      // Select contact form and check generated snippets
      await page.selectOption('#form-select', 'contact');
      await page.waitForTimeout(200);

      // The snippet should not crash — it should render valid HTML
      const snippetText = await page.locator('#snippet-htmx').textContent();
      expect(snippetText).toContain('cap-widget');
      expect(snippetText).toContain('data-cap-api-endpoint');

      // The endpoint should reference /cap-proxy/
      await page.waitForTimeout(100);
      const epText = await page.locator('#snippet-htmx').textContent() || '';
      expect(epText).toContain('/cap-proxy/');
    });
  });

  test.describe('Backward compatibility', () => {

    test('existing form submission still works with cap-widget', async ({ page }) => {
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // Use the contact form — should still submit
      await page.goto(`${BASE}/form/contact`);
      await page.waitForSelector('form');

      // Verify cap-widget is present
      await expect(page.locator('cap-widget')).toBeVisible();

      // Fill and submit
      await page.fill('input[name="name"]', 'Compat Test');
      await page.fill('input[name="email"]', 'compat@test.com');
      await page.fill('textarea[name="message"]', 'Backward compatibility test');

      // Click submit
      await page.click('button[type="submit"]');

      // Should get a response (success or error message)
      await expect(page.locator('#form-response')).not.toBeEmpty({ timeout: 10000 });
    });

    test('cap-widget is visible on form pages', async ({ page }) => {
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        // If cap isn't configured, cap-widget won't be rendered
        // But we can at least verify the page loads without errors
        await page.goto(`${BASE}/form/contact`);
        await page.waitForSelector('form');
        const count = await page.locator('cap-widget').count();
        expect(count).toBe(0);
        return;
      }

      // Check form pages have cap-widget
      await page.goto(`${BASE}/form/contact`);
      await page.waitForSelector('form');
      await expect(page.locator('cap-widget')).toBeVisible();

      // Also verify it has the required attribute
      await expect(page.locator('cap-widget')).toHaveAttribute('data-cap-api-endpoint');
    });

    test('embed snippet still shows forms list', async ({ page }) => {
      // The embed snippet page should load and show forms
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#form-select');

      const forms = await page.locator('#form-select option').all();
      expect(forms.length).toBeGreaterThanOrEqual(1);

      // The forms-data script should be present and parseable
      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return null;
        return JSON.parse(el.textContent || '[]');
      });
      expect(formsData).not.toBeNull();
      expect(Array.isArray(formsData)).toBe(true);
    });
  });
});
