# Spec: Add Embed Snippet link to admin sidebar

## Problem

The admin sidebar only has Dashboard and Forms links. The Form Embed Snippet page is at `/` (served by `embed_snippet.html`), but there's no navigation link to it — users must know the URL or add "/" manually.

## Fix

### File: `app/templates/admin_dashboard.html`

Add an Embed link in the sidebar nav list (line 38, after Forms):

```html
        <li><a href="/admin" class="{% if not show_forms and not editing_form %}active{% endif %}">Dashboard</a></li>
        <li><a href="/admin/forms" class="{% if show_forms or editing_form is defined and editing_form %}active{% endif %}">Forms</a></li>
        <li><a href="/">Embed</a></li>
```

No `active` class needed since the embed page uses a completely different template (`embed_snippet.html`) and won't match the admin dashboard's context variables.

## Verification

1. Open `/admin` — sidebar should show Dashboard, Forms, Embed links
2. Click Embed — should navigate to `/` (the embed snippet page)
3. Sidebar highlights should still work for Dashboard and Forms
