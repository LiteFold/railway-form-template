# Spec: Move copy button to bottom-right of code block

## Problem

The copy button on embed code blocks is positioned at `top: 8px; right: 8px` — it overlaps the first line of code. Should be at the bottom-right corner instead.

## Fix

### File: `app/static/admin.css`

Change `.copy-btn` (line 428) from `top: 8px` to `bottom: 8px`:

```css
.copy-btn {
  position: absolute;
  bottom: 8px;   /* was: top: 8px */
  right: 8px;
  ...
}
```

This moves the button to the bottom-right corner of the `.code-block-wrapper`, below the last line of code so it doesn't overlap any text.

## Verification

1. Open `/` — both code blocks (regular and HTMX) should have the copy button at bottom-right
2. Copy button should NOT overlap any code lines
3. Copy button should still be clickable and show "Copied!" feedback
