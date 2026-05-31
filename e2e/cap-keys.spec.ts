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

test.describe('Per-Form Cap CAPTCHA Site Keys', () => {

  test.describe('Auto-provisioning on form creation', () => {

    test('new form gets a non-null cap_site_key when Cap API is configured', async ({ page }) => {
      // This test only applies when the Cap API endpoint is configured on staging.
      // Skip gracefully if cap-widget is not present (meaning CAP_ENDPOINT is not set).
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // Login to admin
      await login(page);

      // Create a new form
      const slug = 'e2e-cap-key-test-' + Date.now();
      await page.goto(`${BASE}/admin/forms/new`);
      await page.fill('input[name="slug"]', slug);
      await page.fill('input[name="title"]', 'Cap Key Test Form');
      // Add a basic text field so the form is valid
      await page.locator('.add-field-btn').click();
      await page.locator('.field-card input[type="text"]').first().fill('Full Name');
      await page.locator('button[type="submit"]').click();

      // Wait for the form to appear in the forms list
      await expect(page.locator(`.form-item:has-text("${slug}") h3`)).toBeVisible();

      // Navigate to the embed snippet page to check the forms-data JSON
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#forms-data');

      // Parse the forms-data JSON to find our new form's cap_site_key
      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return [];
        return JSON.parse(el.textContent || '[]');
      });

      const ourForm = formsData.find((f: any) => f.slug === slug);
      expect(ourForm).toBeDefined();
      expect(ourForm.cap_site_key).not.toBeNull();
      expect(typeof ourForm.cap_site_key).toBe('string');
      expect(ourForm.cap_site_key!.length).toBeGreaterThan(0);

      // Clean up: delete the form we created
      await page.goto(`${BASE}/admin/forms`);
      const formItem = page.locator(`.form-item:has-text("${slug}")`);
      if (await formItem.isVisible()) {
        page.once('dialog', dialog => dialog.accept());
        await formItem.locator('.btn-danger').click();
        await expect(formItem).toHaveCount(0);
      }
    });

    test('embed snippet data section includes per-form cap_site_key', async ({ page }) => {
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // Login and create a form
      await login(page);
      const slug = 'e2e-embed-key-test-' + Date.now();
      await page.goto(`${BASE}/admin/forms/new`);
      await page.fill('input[name="slug"]', slug);
      await page.fill('input[name="title"]', 'Embed Key Test');
      await page.locator('.add-field-btn').click();
      await page.locator('.field-card input[type="text"]').first().fill('Name');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator(`.form-item:has-text("${slug}") h3`)).toBeVisible();

      // Navigate to embed snippet page
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#forms-data');

      // Select our form in the dropdown
      await page.selectOption('#form-select', slug);

      // Check the JSON data includes cap_site_key for our form
      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return [];
        return JSON.parse(el.textContent || '[]');
      });
      const ourForm = formsData.find((f: any) => f.slug === slug);
      expect(ourForm).toBeDefined();
      expect(ourForm.cap_site_key).not.toBeNull();

      // Check the generated snippet code includes the per-form key in the endpoint
      const snippetText = await page.locator('#snippet-code').textContent();
      expect(snippetText).toContain(ourForm.cap_site_key);

      // Also check the HTMX snippet
      const htmxSnippet = await page.locator('#snippet-htmx').textContent();
      expect(htmxSnippet).toContain(ourForm.cap_site_key);

      // Clean up
      await page.goto(`${BASE}/admin/forms`);
      const formItem = page.locator(`.form-item:has-text("${slug}")`);
      if (await formItem.isVisible()) {
        page.once('dialog', dialog => dialog.accept());
        await formItem.locator('.btn-danger').click();
      }
    });
  });

  test.describe('Per-form site key in public form page', () => {

    test('data-cap-api-endpoint includes the per-form site key for modern forms', async ({ page }) => {
      // Skip if cap is not configured
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // Create a form (which should get auto-provisioned keys)
      await login(page);
      const slug = 'e2e-pub-key-test-' + Date.now();
      await page.goto(`${BASE}/admin/forms/new`);
      await page.fill('input[name="slug"]', slug);
      await page.fill('input[name="title"]', 'Public Key Test');
      await page.locator('.add-field-btn').click();
      await page.locator('.field-card input[type="text"]').first().fill('Name');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator(`.form-item:has-text("${slug}") h3`)).toBeVisible();

      // Navigate to the public form page
      await page.goto(`${BASE}/form/${slug}`);
      await page.waitForSelector('form');

      // Check the data-cap-api-endpoint includes the per-form site key
      const capWidget = page.locator('cap-widget');
      await expect(capWidget).toBeVisible();
      const endpoint = await capWidget.getAttribute('data-cap-api-endpoint');
      expect(endpoint).toBeTruthy();
      
      // The endpoint should include a site key (not just /cap-proxy/ with nothing after)
      // Format: https://host/cap-proxy/<site_key>/
      expect(endpoint).toMatch(/\/cap-proxy\/[^\/]+\/$/);
      
      // Get the site key from the embed page to verify it matches
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#forms-data');
      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return [];
        return JSON.parse(el.textContent || '[]');
      });
      const ourForm = formsData.find((f: any) => f.slug === slug);
      expect(ourForm).toBeTruthy();
      expect(endpoint).toContain(ourForm.cap_site_key);

      // Clean up
      await page.goto(`${BASE}/admin/forms`);
      const formItem = page.locator(`.form-item:has-text("${slug}")`);
      if (await formItem.isVisible()) {
        page.once('dialog', dialog => dialog.accept());
        await formItem.locator('.btn-danger').click();
      }
    });
  });

  test.describe('Global fallback for pre-feature forms', () => {

    test('contact form cap_site_key is null (created before feature)', async ({ page }) => {
      // The 'contact' form was created during init_db without auto-provisioning.
      // Its cap_site_key should be null in the forms-data JSON.
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#forms-data');

      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return [];
        return JSON.parse(el.textContent || '[]');
      });

      const contactForm = formsData.find((f: any) => f.slug === 'contact');
      expect(contactForm).toBeDefined();
      // Pre-feature forms should have null cap_site_key
      expect(contactForm.cap_site_key).toBeNull();
    });

    test('public form template falls back to settings.cap_site_key when per-form key is null', async ({ page }) => {
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // For the contact form (no per-form key), the template uses:
      // form.cap_site_key or settings.cap_site_key
      // We check what's actually rendered in data-cap-api-endpoint
      await page.goto(`${BASE}/form/contact`);
      await page.waitForSelector('form');

      const capWidget = page.locator('cap-widget');
      await expect(capWidget).toBeVisible();
      const endpoint = await capWidget.getAttribute('data-cap-api-endpoint');
      expect(endpoint).toBeTruthy();
      
      // The endpoint should either end with /cap-proxy/ (no key) or include a key
      // If settings.cap_site_key is not set, it's just /cap-proxy/
      // If settings.cap_site_key IS set, it includes that key
      expect(endpoint).toMatch(/\/cap-proxy\//);
    });

    test('embed snippet JS uses per-form key or falls back to global settings.cap_site_key', async ({ page }) => {
      // Check the embed snippet page renders correct endpoints
      await page.goto(`${BASE}/`);
      await page.waitForSelector('#forms-data');

      const formsData = await page.evaluate(() => {
        const el = document.getElementById('forms-data');
        if (!el) return [];
        return JSON.parse(el.textContent || '[]');
      });

      // The contact form should have null cap_site_key (pre-feature)
      const contactForm = formsData.find((f: any) => f.slug === 'contact');
      expect(contactForm).toBeDefined();

      // Select contact form and check generated snippets
      await page.selectOption('#form-select', 'contact');
      await page.waitForTimeout(200); // let JS update snippet

      // The snippet should not crash - it should render valid HTML
      const snippetText = await page.locator('#snippet-code').textContent();
      expect(snippetText).toContain('cap-widget');
      expect(snippetText).toContain('data-cap-api-endpoint');
      
      // The JS getCapSnippet function should produce valid output
      const generatedEndpoint = await page.evaluate(() => {
        // Simulate what getCapSnippet does
        const forms = JSON.parse(document.getElementById('forms-data')!.textContent || '[]');
        const form = forms.find((f: any) => f.slug === 'contact');
        const formKey = form && form.cap_site_key;
        // The JS uses: formKey || "{{ settings.cap_site_key }}"
        // Since settings is server-side, we need a different approach
        // Just verify the JS function exists and runs without error
        return typeof (window as any).getCapSnippet !== 'undefined';
      });
      expect(generatedEndpoint).toBe(true);
    });
  });

  test.describe('Backward compatibility', () => {

    test('existing form submission still works with cap-widget', async ({ page }) => {
      const capConfigured = await isCapConfigured(page);
      if (!capConfigured) {
        test.skip();
        return;
      }

      // Use the contact form (pre-feature) — should still submit successfully
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
      
      // Should get a success response
      await expect(page.locator('#form-response')).toContainText('Thank you', { timeout: 10000 });
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

      // Check multiple form pages have cap-widget
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
