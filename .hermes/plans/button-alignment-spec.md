# Spec: Align action buttons across read/unread rows

## Problem

In the submissions table (`app/templates/admin_submissions.html`), the toggle button text changes between "Mark read" (9 chars) and "Mark unread" (11 chars). Since `.table-actions` is a flex container with `gap: 4px` and buttons shrink to fit content, the Delete button shifts ~15px to the right on read rows vs unread rows. Visually jarring.

## Fix

### File: `app/templates/admin_submissions.html`

Add class `btn-toggle` to the toggle button (line 48):
```html
<button
  class="btn btn-sm btn-ghost btn-toggle"
  hx-get="/admin/submission/{{ sub['id'] }}/toggle"
>
```

### File: `app/static/admin.css`

Add CSS rule after `.btn-sm` (around line 208):
```css
.btn-toggle { min-width: 88px; text-align: center; }
```

88px comfortably fits "Mark unread" at 0.8125rem (~13px font) — 11 chars × ~7.5px ≈ 83px plus padding. The button will render at the same width in both states, keeping Delete in the same position.

## Verification

1. `git checkout staging && git pull && git checkout -b feature/t_<task_id>`
2. Make the two changes above
3. `git add -A && git commit -m "t_<task_id>: fix button alignment in submissions table"`
4. `git push origin feature/t_<task_id>`
5. Report back with branch name
