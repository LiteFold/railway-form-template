import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://form-api-staging.up.railway.app';

test.describe('API Endpoints', () => {
  test('GET /health returns 200', async ({ request }) => {
    const resp = await request.get(BASE + '/health');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.status).toBe('healthy');
  });

  test('GET /pow-challenge returns challenge', async ({ request }) => {
    const resp = await request.get(BASE + '/pow-challenge?difficulty=4');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty('secret');
    expect(body).toHaveProperty('nonce');
    expect(body).toHaveProperty('difficulty');
    expect(body.difficulty).toBe(4);
  });

  test('GET /pow-challenge with custom difficulty', async ({ request }) => {
    const resp = await request.get(BASE + '/pow-challenge?difficulty=6');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.difficulty).toBe(6);
  });

  test('POST /form/{slug} with valid data returns 201 JSON', async ({ request }) => {
    const resp = await request.post(BASE + '/form/contact', {
      headers: { 'Accept': 'application/json' },
      form: { name: 'API Test', email: 'api@test.com', message: 'API test submission' },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.status).toBe('ok');
  });

  test('POST /form/{slug} with honeypot returns 400 JSON', async ({ request }) => {
    const resp = await request.post(BASE + '/form/contact', {
      headers: { 'Accept': 'application/json' },
      form: { name: 'Bot', email: 'bot@test.com', message: 'spam', _hp_website: 'filled' },
    });
    expect(resp.status()).toBe(400);
  });

  test('POST /form/{slug} with missing required field returns 400', async ({ request }) => {
    const resp = await request.post(BASE + '/form/contact', {
      headers: { 'Accept': 'application/json' },
      form: { name: '', email: 'test@test.com', message: 'hi' },
    });
    expect(resp.status()).toBe(400);
  });

  test('POST /form/{slug} with HX-Request returns HTML success', async ({ request }) => {
    const resp = await request.post(BASE + '/form/contact', {
      headers: { 'HX-Request': 'true' },
      form: { name: 'HTMX', email: 'htmx@test.com', message: 'HTMX test' },
    });
    // HTMX/HTML responses get status 200 from the app, not 201
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text).toContain('Thank you');
  });

  test('POST /form/nonexistent returns 404', async ({ request }) => {
    const resp = await request.post(BASE + '/form/doesnotexist_' + Date.now(), {
      form: { name: 'nope' },
    });
    expect(resp.status()).toBe(404);
  });

  test('POST /form/{slug} with empty body returns 400', async ({ request }) => {
    const resp = await request.post(BASE + '/form/contact', {
      data: '',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    });
    expect(resp.status()).toBe(400);
  });

  test('GET / returns embed snippet page', async ({ request }) => {
    const resp = await request.get(BASE + '/');
    expect(resp.ok()).toBeTruthy();
    const text = await resp.text();
    expect(text).toContain('Embed Snippet');
  });
});
