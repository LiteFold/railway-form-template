# Admin Dashboard — Sun/Moon Dark Mode Toggle

## Scope
Add a light/dark theme toggle (sun/moon icon button) to the **admin dashboard sidebar header only**.
The sidebar in `app/templates/admin_dashboard.html` is the shared chrome for Dashboard, Forms, and
Submission Detail (all three are `{% include %}`-ed into it), so one toggle covers all authenticated
admin views.

**Out of scope (do not touch):** `app/templates/admin_login.html`, `app/templates/public_form.html`,
`app/templates/embed_snippet.html`. These are separate standalone `<html>` documents without the
sidebar; `embed_snippet.html` happens to link `admin.css` too, but since it never sets the
`data-theme` attribute it will keep rendering with the light (`:root`) values by default — leave it
that way.

**Also leave unchanged (semantic/status colors, read fine on both themes as-is):**
`.alert.error`, `.btn-danger` (and its hover), `.field-card-actions .btn-del` (and its hover),
the `#slug-error` inline color in `admin_forms.html`, and the `pre` / `.copy-btn` code-block styles
in `admin.css` (lines ~418-440) — that block is an intentionally-dark code sample shown on a light
page in both themes.

## Step 1 — Add CSS variables to `app/static/admin.css`

Insert this block at the very top of the file, before the existing `*, *::before, *::after` reset
(currently line 1):

```css
:root {
  --bg-page: #f5f5f5;
  --bg-surface: #fff;
  --bg-inset: #f9fafb;
  --bg-hover: #fafafa;
  --bg-accent-subtle: #eff6ff;
  --bg-unread: #f0f7ff;
  --bg-unread-hover: #e8f2ff;
  --text-primary: #333;
  --text-secondary: #555;
  --text-muted: #666;
  --text-faint: #888;
  --text-disabled: #bbb;
  --border-color: #ddd;
  --border-subtle: #f0f0f0;
  --border-subtle-2: #f5f5f5;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --text-on-accent: #fff;
  --focus-ring: rgba(37, 99, 235, 0.1);
  --bg-sidebar: #1e293b;
  --text-sidebar: #e2e8f0;
  --text-sidebar-muted: #94a3b8;
  --bg-sidebar-active: rgba(37, 99, 235, 0.2);
  --text-sidebar-active: #60a5fa;
  --badge-read-bg: #e5e7eb;
  --badge-read-text: #6b7280;
  --badge-unread-bg: #dbeafe;
  --badge-unread-text: #2563eb;
  --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 12px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] {
  --bg-page: #0f172a;
  --bg-surface: #1e293b;
  --bg-inset: #273549;
  --bg-hover: #243247;
  --bg-accent-subtle: #1e3a5f;
  --bg-unread: #1e3a5f;
  --bg-unread-hover: #234875;
  --text-primary: #e2e8f0;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-faint: #64748b;
  --text-disabled: #556070;
  --border-color: #334155;
  --border-subtle: #27344a;
  --border-subtle-2: #27344a;
  --color-accent: #3b82f6;
  --color-accent-hover: #60a5fa;
  --text-on-accent: #fff;
  --focus-ring: rgba(59, 130, 246, 0.2);
  --bg-sidebar: #0b1220;
  --text-sidebar: #e2e8f0;
  --text-sidebar-muted: #94a3b8;
  --bg-sidebar-active: rgba(59, 130, 246, 0.25);
  --text-sidebar-active: #60a5fa;
  --badge-read-bg: #334155;
  --badge-read-text: #94a3b8;
  --badge-unread-bg: #1e3a5f;
  --badge-unread-text: #60a5fa;
  --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 12px rgba(0, 0, 0, 0.4);
}
```

## Step 2 — Replace hardcoded colors in `app/static/admin.css` with the variables

Find each selector below by its **selector text** (line numbers are from the pre-Step-1 file and
will drift once the block above is inserted — match by selector, not line number) and replace only
the listed property values. Leave every other property untouched.

| Selector | Property | Old value | New value |
|---|---|---|---|
| `body` | `background` | `#f5f5f5` | `var(--bg-page)` |
| `body` | `color` | `#333` | `var(--text-primary)` |
| `a` | `color` | `#2563eb` | `var(--color-accent)` |
| `.login-page` | `background` | `#f0f2f5` | `var(--bg-page)` |
| `.login-card` | `background` | `#fff` | `var(--bg-surface)` |
| `.login-card` | `box-shadow` | `0 2px 12px rgba(0,0,0,0.08)` | `var(--shadow-md)` |
| `.login-card h1` | `color` | `#2563eb` | `var(--color-accent)` |
| `.login-card h2` | `color` | `#666` | `var(--text-muted)` |
| `.login-card label` | `color` | `#555` | `var(--text-secondary)` |
| `.login-card input[type="password"]` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.login-card input[type="password"]:focus` | `border-color` | `#2563eb` | `var(--color-accent)` |
| `.login-card input[type="password"]:focus` | `box-shadow` | `0 0 0 2px rgba(37,99,235,0.1)` | `0 0 0 2px var(--focus-ring)` |
| `.login-card button` | `background` | `#2563eb` | `var(--color-accent)` |
| `.login-card button` | `color` | `#fff` | `var(--text-on-accent)` |
| `.login-card button:hover` | `background` | `#1d4ed8` | `var(--color-accent-hover)` |
| `.sidebar` | `background` | `#1e293b` | `var(--bg-sidebar)` |
| `.sidebar` | `color` | `#e2e8f0` | `var(--text-sidebar)` |
| `.sidebar a` | `color` | `#94a3b8` | `var(--text-sidebar-muted)` |
| `.sidebar a:hover` | `color` | `#e2e8f0` | `var(--text-sidebar)` |
| `.sidebar a.active` | `background` | `rgba(37,99,235,0.2)` | `var(--bg-sidebar-active)` |
| `.sidebar a.active` | `color` | `#60a5fa` | `var(--text-sidebar-active)` |
| `.content p` | `color` | `#666` | `var(--text-muted)` |
| `.btn-primary` | `background` | `#2563eb` | `var(--color-accent)` |
| `.btn-primary` | `color` | `#fff` | `var(--text-on-accent)` |
| `.btn-primary:hover` | `background` | `#1d4ed8` | `var(--color-accent-hover)` |
| `.btn-ghost` | `color` | `#666` | `var(--text-muted)` |
| `.btn-ghost` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.btn-ghost:hover` | `background` | `#f5f5f5` | `var(--bg-hover)` |
| `.table-wrapper` | `background` | `#fff` | `var(--bg-surface)` |
| `.table-wrapper` | `box-shadow` | `0 1px 4px rgba(0,0,0,0.06)` | `var(--shadow-sm)` |
| `th` | `color` | `#888` | `var(--text-faint)` |
| `th` | `background` | `#fafafa` | `var(--bg-hover)` |
| `th` | `border-bottom` | `1px solid #eee` | `1px solid var(--border-subtle)` |
| `td` | `border-bottom` | `1px solid #f0f0f0` | `1px solid var(--border-subtle)` |
| `tr:hover td` | `background` | `#fafbfc` | `var(--bg-hover)` |
| `tr.unread td` | `background` | `#f0f7ff` | `var(--bg-unread)` |
| `tr.unread:hover td` | `background` | `#e8f2ff` | `var(--bg-unread-hover)` |
| `.badge-read` | `background` | `#e5e7eb` | `var(--badge-read-bg)` |
| `.badge-read` | `color` | `#6b7280` | `var(--badge-read-text)` |
| `.badge-unread` | `background` | `#dbeafe` | `var(--badge-unread-bg)` |
| `.badge-unread` | `color` | `#2563eb` | `var(--badge-unread-text)` |
| `.search-bar input` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.search-bar input:focus` | `border-color` | `#2563eb` | `var(--color-accent)` |
| `.form-filter` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.form-filter` | `background` | `#fff` | `var(--bg-surface)` |
| `.form-filter:focus` | `border-color` | `#2563eb` | `var(--color-accent)` |
| `.pagination a` | `background` | `#f5f5f5` | `var(--bg-hover)` |
| `.pagination a` | `color` | `#333` | `var(--text-primary)` |
| `.pagination a` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.pagination a:hover` | `background` | `#e5e7eb` | `var(--badge-read-bg)` |
| `.pagination .active` | `background` | `#2563eb` | `var(--color-accent)` |
| `.pagination .active` | `color` | `#fff` | `var(--text-on-accent)` |
| `.pagination .active` | `border-color` | `#2563eb` | `var(--color-accent)` |
| `.form-list` | `background` | `#fff` | `var(--bg-surface)` |
| `.form-list` | `box-shadow` | `0 1px 4px rgba(0,0,0,0.06)` | `var(--shadow-sm)` |
| `.form-item` | `border-bottom` | `1px solid #f0f0f0` | `1px solid var(--border-subtle)` |
| `.form-item .slug` | `color` | `#888` | `var(--text-faint)` |
| `.form-edit` | `background` | `#fff` | `var(--bg-surface)` |
| `.form-edit` | `box-shadow` | `0 1px 4px rgba(0,0,0,0.06)` | `var(--shadow-sm)` |
| `.form-edit label` | `color` | `#555` | `var(--text-secondary)` |
| `.form-edit input[type="text"], .form-edit textarea` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.form-edit input:focus, .form-edit textarea:focus` | `border-color` | `#2563eb` | `var(--color-accent)` |
| `.embed-container select` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.empty-state` | `color` | `#888` | `var(--text-faint)` |

## Step 3 — Add toggle button styles to `app/static/admin.css`

Add this new section right after the `.sidebar h2` rule (currently lines 112-118):

```css
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-left: 8px;
}

.sidebar-header h2 { margin-bottom: 0; }

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: var(--text-sidebar-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-sidebar);
}

.theme-toggle .icon-moon { display: none; }

[data-theme="dark"] .theme-toggle .icon-sun { display: none; }
[data-theme="dark"] .theme-toggle .icon-moon { display: inline; }
```

Note: `.sidebar h2` already has `margin-bottom: 24px; padding-left: 8px;` — once it's wrapped in
`.sidebar-header` (Step 4), remove those two properties from `.sidebar h2` itself so spacing isn't
doubled, keeping only `font-size: 1rem; font-weight: 600; color: #fff;` on `.sidebar h2`.

## Step 4 — Wire up `app/templates/admin_dashboard.html`

**4a.** In `<head>`, immediately after the `<meta name="viewport" ...>` tag (line 5) and before the
`<link rel="stylesheet">` (line 7), insert a theme-init script so the correct theme applies before
first paint (no flash):

```html
<script>
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
</script>
```

**4b.** Replace the sidebar header (currently line 35: `<h2>Contact Form</h2>`) with:

```html
<div class="sidebar-header">
  <h2>Contact Form</h2>
  <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode">
    <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
  </button>
</div>
```

**4c.** Immediately before `</body>` (currently line 102), add the click handler:

```html
<script>
(function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var html = document.documentElement;
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();
</script>
```

Each admin page (Dashboard/Forms/Submission Detail) is a normal full page load via `<a href>` links,
not an HTMX swap of `<html>` itself, so the head script re-applies the stored theme on every
navigation — no extra wiring needed for persistence across pages.

## Step 5 — Replace hardcoded colors in `app/templates/admin_forms.html`

This template is `{% include %}`-d inside `admin_dashboard.html`'s `<main>`, so its two inline
`<style>` blocks (around lines 33-36 and 43-120) need the same variables:

| Selector | Property | Old value | New value |
|---|---|---|---|
| `.field-card` | `background` | `#f9fafb` | `var(--bg-inset)` |
| `.field-card` | `border` | `1px solid #e5e7eb` | `1px solid var(--border-color)` |
| `#field-builder .field-card-row label` | `color` | `#666` | `var(--text-muted)` |
| `#field-builder .field-card-row input, #field-builder .field-card-row select` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `#field-builder .field-card-row input:focus, #field-builder .field-card-row select:focus` | `border-color` | `#2563eb` | `var(--color-accent)` |
| `.field-card-actions button` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `.field-card-actions button` | `background` | `#fff` | `var(--bg-surface)` |
| `.field-card-actions button` | `color` | `#555` | `var(--text-secondary)` |
| `.field-card-actions button:hover` | `background` | `#f0f0f0` | `var(--bg-hover)` |
| `.add-field-btn` | `border` | `1px dashed #2563eb` | `1px dashed var(--color-accent)` |
| `.add-field-btn` | `color` | `#2563eb` | `var(--color-accent)` |
| `.add-field-btn:hover` | `background` | `#eff6ff` | `var(--bg-accent-subtle)` |
| `#post_submit_message` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |
| `#redirect_url` | `border` | `1px solid #ddd` | `1px solid var(--border-color)` |

Leave `#slug-error`'s inline `color:#ef4444` and `.field-card-actions .btn-del` / its hover
unchanged (error/danger colors, out of scope — see top of this doc).

## Step 6 — Replace hardcoded colors in `app/templates/admin_submission_detail.html`

Also `{% include %}`-d inside `admin_dashboard.html`. Its inline `<style>` block (around lines
66-140):

| Selector | Property | Old value | New value |
|---|---|---|---|
| `.detail-card` | `background` | `#fff` | `var(--bg-surface)` |
| `.detail-card` | `box-shadow` | `0 1px 4px rgba(0,0,0,0.06)` | `var(--shadow-sm)` |
| `.detail-section-title` | `color` | `#888` | `var(--text-faint)` |
| `.detail-section-title` | `border-bottom` | `1px solid #f0f0f0` | `1px solid var(--border-subtle)` |
| `.detail-row` | `border-bottom` | `1px solid #f5f5f5` | `1px solid var(--border-subtle-2)` |
| `.detail-label` | `color` | `#555` | `var(--text-secondary)` |
| `.detail-value` | `color` | `#333` | `var(--text-primary)` |
| `.detail-null` | `color` | `#bbb` | `var(--text-disabled)` |
| `.detail-json` | `background` | `#f8f9fa` | `var(--bg-inset)` |
| `.detail-json` | `border` | `1px solid #e9ecef` | `1px solid var(--border-color)` |
| `.detail-actions` | `background` | `#fff` | `var(--bg-surface)` |
| `.detail-actions` | `box-shadow` | `0 1px 4px rgba(0,0,0,0.06)` | `var(--shadow-sm)` |

## Verification
1. `python3 -c "import app.main"` — must still import cleanly (no template/syntax errors).
2. Run the app locally (`uvicorn app.main:app --port 8000`), log into `/admin`:
   - Toggle button renders in the sidebar, right of "Contact Form", showing a sun icon in light mode.
   - Clicking it switches the whole admin shell (sidebar, table, cards, forms editor, submission
     detail) to the dark palette and swaps the icon to a moon.
   - Reload the page — the chosen theme persists (via `localStorage`).
   - Navigate Dashboard → Forms → a submission's detail view — theme stays consistent across all
     three (no flash of the other theme on load).
3. Visit `/` (public form) and `/admin/login` — confirm both are unaffected and still render in
   their normal light style (no toggle present, no `data-theme` attribute set on their `<html>`).
4. `npx playwright test` (from `e2e/`) — existing suite must still pass; none of it currently depends
   on exact hex colors (CSS selectors/text/structure only), so no E2E spec file needs to change for
   this task. If QA finds the toggle itself needs coverage, that's a new E2E spec added in step 4 of
   the PM workflow, not part of this implementation spec.
