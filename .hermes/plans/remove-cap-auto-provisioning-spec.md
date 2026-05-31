# Spec: Remove broken Cap auto-provisioning code

## Problem

`app/cap_api.py` attempted to auto-create Cap site keys for each form via `POST {endpoint}/sitekey`, but the Cap server doesn't expose a public API for this — keys can only be created through the Cap web UI. The function silently returns `None`, and `forms.py` handles the `None` gracefully, creating dead code.

## Files to clean

### 1. `app/cap_api.py` — Already done (simplified to no-op)

### 2. `app/forms.py` — Remove auto-provisioning from `create_form()`

Remove lines 45-58 (the Cap API call block):

```python
# Remove this entire block:
    from app.config import settings
    from app.cap_api import create_cap_site_key
    if settings.cap_endpoint and settings.cap_secret_key:
        cap_result = await create_cap_site_key(slug, settings.cap_endpoint, settings.cap_secret_key)
        if cap_result:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE forms SET cap_site_key = $1, cap_site_secret = $2 WHERE slug = $3",
                    cap_result["site_key"], cap_result["secret_key"], slug,
                )
            result["cap_site_key"] = cap_result["site_key"]
            result["cap_site_secret"] = cap_result["secret_key"]
        else:
            logger.warning(f"Failed to auto-provision Cap site key for form '{slug}'")
```

Also remove the unused `logging` import at the top of the file since it's only used for the Cap warning.

### 3. `app/templates/embed_snippet.html` — Simplify site key logic

The template currently has fallback chains using `forms[0].cap_site_key or settings.cap_site_key`. Since all forms now use the global key, simplify to just use `settings.cap_site_key`:

Replace `{% if forms[0].cap_site_key or settings.cap_site_key %}{{ forms[0].cap_site_key or settings.cap_site_key }}/{% endif %}` with `{% if settings.cap_site_key %}{{ settings.cap_site_key }}/{% endif %}`

And in the JavaScript section, replace the `var formKey = form && form.cap_site_key;` / `var siteKey = formKey || "{{ settings.cap_site_key }}";` with just `var siteKey = "{{ settings.cap_site_key }}";`

## Verification

1. Create a new form — should succeed without errors
2. The embed snippet for the new form should use `cap-proxy/98359f1a44/` (from env var)
3. Existing forms should continue to work (they already use the global key)
4. The admin logs should not show "Failed to auto-provision" warnings
