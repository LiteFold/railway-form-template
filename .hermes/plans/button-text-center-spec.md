# Spec: Center-align text in Mark read/Mark unread toggle button

## Problem

The `.btn-toggle` button (Mark read / Mark unread) uses `display: inline-flex` (from `.btn`) and has `text-align: center` — but `text-align` doesn't work on flex containers. The text sits left-aligned inside the button's flex box.

## Fix

### File: `app/static/admin.css`

Change `.btn-toggle` rule (around line 209) from:
```css
.btn-toggle { min-width: 88px; text-align: center; }
```

To:
```css
.btn-toggle { min-width: 88px; justify-content: center; }
```

`justify-content: center` is the flexbox-equivalent of `text-align: center`. It centers the button label text horizontally within the fixed-width button.

## Verification

1. Open `/admin`
2. Find a read row (shows "Mark unread") — text should be centered in the button
3. Find an unread row (shows "Mark read") — text should be centered in the button
4. Click toggle on a row — after HTMX swap, the new button text should still be centered
