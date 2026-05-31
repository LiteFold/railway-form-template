# Spec: Show inline slug duplicate error instead of replacing the page

## Problem

When creating a form with a duplicate slug, the `create_form_route` returns:
```python
return HTMLResponse(status_code=400, content="A form with this slug already exists.")
```

HTMX swaps this plain text into `main.content`, replacing the entire form editor. The user loses all their filled-in data and has to navigate back and start over.

**Desired behavior:** The error message appears inline below the slug input field, with all form data preserved so the user can quickly correct the slug and resubmit.

## Fix

### `app/admin.py` — create_form_route (line 317)

Instead of returning a plain text error, return the form editor template with the submitted data preserved and an error message:

```python
@router.post("/forms")
async def create_form_route(
    request: Request,
    slug: str = Form(...),
    title: str = Form("Contact Form"),
    fields_json: str = Form("[]"),
):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    import json
    try:
        fields = json.loads(fields_json)
    except json.JSONDecodeError as e:
        return HTMLResponse(status_code=400, content=f"Invalid fields JSON: {e}")
    try:
        await create_form(pool, slug, title, fields)
    except asyncpg.exceptions.UniqueViolationError:
        # Return the form editor with the submitted data preserved
        return await TemplateResponse(
            "admin_dashboard.html",
            {
                "request": request,
                "editing_form": {"slug": slug, "title": title, "fields": fields},
                "slug_error": f"A form with slug '{slug}' already exists. Please choose a different slug.",
            },
        )
    forms = await get_forms(pool)
    return await TemplateResponse(
        "admin_forms.html",
        {"request": request, "forms": forms},
    )
```

### `app/templates/admin_forms.html` — Slug field (line 14-15)

Add error display below the slug input:

```html
<label for="slug">Slug</label>
<input type="text" name="slug" id="slug" value="{{ editing_form.get('slug', '') }}" required {{ 'readonly' if editing_form.get('id') }}>
{% if slug_error %}
<div class="field-error" style="color:#ef4444;font-size:0.8125rem;margin-top:4px;">{{ slug_error }}</div>
{% endif %}
```

Also update the `hx-target-error` attribute on the form to keep the error swap context correct. The form currently has `hx-target-error="main.content"` which should remain since other errors may still need it.

## Verification

1. Open admin → Forms → New Form
2. Fill in slug, title, fields
3. Submit with a slug that already exists
4. The form should remain visible with the submitted data preserved
5. A red error message should appear below the slug input saying the slug is taken
6. Correct the slug and resubmit — should succeed
