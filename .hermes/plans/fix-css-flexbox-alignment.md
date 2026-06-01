# Fix CSS Flexbox Alignment — .code-block-wrapper

## Problem
The `.code-block-wrapper` element is missing `align-items: flex-end` CSS property. Playwright test `copy-button-position.spec.ts:99` expects this value but gets `align-items: normal` (default).

## Root Cause
**File: `app/static/admin.css`**, around line 200:
```css
.code-block-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* MISSING: align-items: flex-end; */
}
```
The default `align-items` for flex containers is `stretch` (rendered as `normal`), which differs from the expected `flex-end`.

## Fix
Add `align-items: flex-end;` to `.code-block-wrapper` in `app/static/admin.css`.

### Specific change
```css
.code-block-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
}
```

## Verification
- `npx playwright test --config e2e/playwright.config.ts copy-button-position.spec.ts` — must pass
- All other tests must still pass
