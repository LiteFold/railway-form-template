# Spec: Align dropdown height with adjacent search input

## Problem

The form filter dropdown (`<select class="form-filter">`) in the submissions search bar uses browser default styling — its height, padding, border, border-radius, and font-size don't match the adjacent search `<input>`, causing visual misalignment.

## Fix

### File: `app/static/admin.css`

Add a style rule for `.form-filter` (after the `.search-bar input` block, around line 286):

```css
.form-filter {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  outline: none;
  background: #fff;
  cursor: pointer;
}

.form-filter:focus {
  border-color: #2563eb;
}
```

This matches the input's `padding`, `border`, `border-radius`, and `font-size` exactly so both elements render at the same visual height. The `background: #fff` ensures the dropdown doesn't inherit a transparent background from the page. The `:focus` style matches the input's focus behavior.

## Verification

1. Open /admin — search bar and dropdown should be exactly the same height
2. Both elements should share the same border color and border-radius
3. Dropdown should have a white background matching the input
