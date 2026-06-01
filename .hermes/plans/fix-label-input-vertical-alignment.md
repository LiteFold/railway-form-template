# Fix Label/Input Vertical Alignment in Field Cards

## Problem
On the admin form builder, the "Label", "Placeholder" text labels (in `<span>` elements) are not vertically centered with their adjacent input boxes. The `<span>` has `offsetTop=418` while the `<input>` has `offsetTop=410` — an **8px delta**.

## Root Cause
**File: `app/static/admin.css`**, line 371:
```css
.form-edit input[type="text"],
.form-edit textarea {
  ...
  margin-bottom: 16px;  /* ← THIS CAUSES THE ISSUE */
}
```

This global rule applies `margin-bottom: 16px` to ALL text inputs inside `.form-edit`, including field-card inputs. Inside the flex label (`display: inline-flex; align-items: center`), this extra margin shifts the input down, breaking the vertical alignment with the `<span>` label text.

### Visual proof (from browser):
| Element | top | bottom | height | delta |
|---------|-----|--------|--------|-------|
| Label `<span>` | 418 | 447 | 29 | — |
| Input "Field 1" | 410 | 439 | 29 | **−8** |

The span's content starts 8px below the input's content, even though both are 29px tall.

## Fix
**File: `app/templates/admin_forms.html`** (inline `<style>` block, around line 60)

In the `.field-card-row input` rule, add `margin-bottom: 0` to override the global `.form-edit input[type="text"]` margin:

```css
.field-card-row input,
.field-card-row select {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.8125rem;
  outline: none;
  margin-bottom: 0;  /* ← ADD THIS - overrides .form-edit margin-bottom: 16px */
}
```

## Verification
1. Load `/admin/forms/new`, click "+ Add Field"
2. Inspect the first field card's "Label" row — `<span>` and `<input>` should have matching `getBoundingClientRect().top` values
3. The delta (span.top - input.top) should be 0, not -8
4. All other form inputs (Slug, Title) should still have their 16px margin
