# Fix Honeypot Validation — Environment Configuration Fix

## Problem
Honeypot spam protection not working:
- `api.spec.js:40` — expects POST with honeypot filled → 400, got 201
- `form-page.spec.ts:77` — expects form submit with filled honeypot → error, got success

## Root Cause (Two Issues)

### Issue 1: CAPTCHA_MODE=off on staging
The staging environment had `CAPTCHA_MODE=off` which bypasses ALL captcha/honeypot validation entirely.

**Fix:** Set `CAPTCHA_MODE=honeypot` on staging.
```bash
rail variable set CAPTCHA_MODE=honeypot --environment staging --service "Form API"
```

### Issue 2: CAP_ENDPOINT causes cap-widget CORS failures
Even with `CAPTCHA_MODE=honeypot`, the form template loads the cap-widget CDN script when `settings.cap_endpoint` is set. The widget fails to reach the challenge endpoint (CORS) and blocks form submission.

**Fix:** Remove `CAP_ENDPOINT` from staging (not needed in honeypot mode).
```bash
rail variable delete CAP_ENDPOINT --environment staging --service "Form API"
```

## Code Status
The app code (`app/main.py`, `app/captcha.py`) was already correct — no code changes needed.

## Verification
- `npx playwright test --config e2e/playwright.config.ts api.spec.js` — must pass
- `npx playwright test --config e2e/playwright.config.ts form-page.spec.ts` — must pass
- All other tests must still pass
