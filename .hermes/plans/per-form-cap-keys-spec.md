# Per-form Cap CAPTCHA site keys with auto-provisioning

## Summary

Currently, all forms share a single `CAP_SITE_KEY` and `CAP_SECRET_KEY` environment variable. This means one Cap CAPTCHA site serves all forms. We want each form to have its own Cap site key that gets auto-provisioned when the form is created, while falling back to the global env var for existing forms.

## Changes needed

### 1. Database migration — add cap columns to forms table (db.py)

Add two nullable columns to the `forms` table:

- `cap_site_key VARCHAR(255) DEFAULT NULL`
- `cap_site_secret VARCHAR(255) DEFAULT NULL`

The `init_db` function in `app/db.py` should use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements (so existing databases upgrade gracefully).

Also include these fields in the default "contact" form INSERT if possible, but since there's no Cap endpoint during init, leave them NULL.

### 2. Cap API client (app/cap_api.py) — new file

Create a new module `app/cap_api.py` with an async function:

```python
async def create_cap_site_key(name: str, endpoint: str, secret_key: str) -> Optional[dict]:
    """
    Call the Cap API to create a new site key.
    
    POST {endpoint}/sitekey
    Body: {"name": name, "allowed_domains": ["*"]}
    Headers: Authorization: Bearer {secret_key}
    
    Returns dict with {"site_key": "...", "secret_key": "..."} on success, None on failure.
    """
```

The exact API shape depends on the Cap service. Looking at the existing cap-proxy pattern, the Cap endpoint is the base URL. The API for creating site keys is typically at `POST /sitekey` with an API key auth header.

Graceful degradation: If the Cap endpoint is not configured or the request fails (timeout, connection error, non-200), return None. Do NOT raise exceptions.

### 3. Form creation — auto-provision Cap keys (forms.py)

Modify `create_form()` in `app/forms.py` to:

1. After inserting the form row, if `settings.cap_endpoint` and `settings.cap_secret_key` are set, call `create_cap_site_key()` with the form slug as the name.
2. If the API call succeeds and returns keys, UPDATE the form row with `cap_site_key` and `cap_site_secret`.
3. If the API call fails (returns None), log a warning but do NOT fail the form creation — the form works without per-form keys.
4. Return the form dict as before, now including the new fields.

The `create_form` function signature stays the same — the auto-provisioning is transparent.

```python
async def create_form(pool: asyncpg.Pool, slug: str, title: str, fields: list):
    # ... existing insert ...
    # then auto-provision Cap site key
    if settings.cap_endpoint and settings.cap_secret_key:
        import logging
        logger = logging.getLogger(__name__)
        result = await create_cap_site_key(slug, settings.cap_endpoint, settings.cap_secret_key)
        if result:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE forms SET cap_site_key = $1, cap_site_secret = $2 WHERE slug = $3",
                    result["site_key"], result["secret_key"], slug,
                )
            # re-fetch the updated row
            ...
        else:
            logger.warning(f"Failed to auto-provision Cap site key for form '{slug}'")
    # return form dict
```

Also update `get_form_by_slug()`, `get_forms()`, `get_form()`, and `update_form()` to return the new fields — the `SELECT *` queries already include them, but the `_parse_form()` helper should handle them (no parsing needed — they're already plain strings/NULL from asyncpg).

Update `update_form()` — it should NOT re-provision the Cap key. Only creation triggers provisioning.

### 4. Embed snippet — per-form site key (embed_snippet.html)

Update the embed snippet template to use the form's per-form `cap_site_key` when available, falling back to `settings.cap_site_key`.

In the embed snippet page (`/` endpoint in main.py), each form's embed snippet should use `form.cap_site_key or settings.cap_site_key` for the cap-proxy URL.

The template currently has:

```
data-cap-api-endpoint="{{ request.base_url }}cap-proxy/{% if settings.cap_site_key %}{{ settings.cap_site_key }}/{% endif %}"
```

This needs to become per-form. Since the embed snippet page uses a dropdown to select which form to embed, the JavaScript already handles snippet generation dynamically. The key changes:

**a) Jinja2 template static snippets** — These show the first form by default. Update to use `forms[0].cap_site_key or settings.cap_site_key`.

**b) `getCapSnippet()` JavaScript function** — This needs to accept a `slug` parameter (or look at the currently selected form) and use that form's `cap_site_key`. Pass the per-form data through the `forms-data` JSON script tag — include `cap_site_key` in each form's data.

**c) `updateSnippet()` JavaScript function** — This already reads the selected form from `forms-data` and re-renders. The `getCapSnippet()` call should use the selected form's `cap_site_key`.

Update the `forms-data` JSON script to include `cap_site_key` per form:

```json
{
  "slug": "contact",
  "title": "Contact Form",
  "fields": [...],
  "cap_site_key": "abc123"  // null if not provisioned
}
```

Then in JavaScript:

```javascript
function getCapSnippet(form) {
  var siteKey = form.cap_site_key || "{{ settings.cap_site_key }}";
  var endpoint = "{{ request.base_url }}cap-proxy/";
  if (siteKey) {
    endpoint += siteKey + "/";
  }
  return '  <script src="https://cdn.jsdelivr.net/npm/cap-widget"><\\/script>\\n  <cap-widget required\\n    data-cap-api-endpoint="' + endpoint + '">\\n  <\\/cap-widget>';
}
```

### 5. Public form page — per-form site key (public_form.html)

Update the cap-widget in `public_form.html` to use `form.cap_site_key or settings.cap_site_key` for the cap-proxy URL.

Current:
```
<cap-widget data-cap-api-endpoint="{{ request.base_url }}cap-proxy/">
```

Change to:
```
<cap-widget data-cap-api-endpoint="{{ request.base_url }}cap-proxy/{% if form.cap_site_key or settings.cap_site_key %}{{ form.cap_site_key or settings.cap_site_key }}/{% endif %}">
```

### 6. CAPTCHA verification — per-form secret key (captcha.py)

The `verify_cap()` function in `app/captcha.py` currently uses `settings.cap_secret_key` globally. For per-form keys, the form's `cap_site_secret` should be used when verifying tokens.

Update the `verify_captcha()` function signature to optionally accept a form's secret key:

```python
async def verify_captcha(request, data: dict, cap_secret_key: Optional[str] = None) -> tuple[bool, Optional[str]]:
```

And update `verify_cap()`:

```python
async def verify_cap(token: str, secret_key: Optional[str] = None) -> bool:
    secret = secret_key or settings.cap_secret_key
    ...
```

In `main.py` (`submit_form`), pass the form's `cap_site_secret` to the captcha verification:

```python
captcha_ok, captcha_err = await verify_captcha(request, data, form_def.get("cap_site_secret"))
```

The `verify_cap` function should then use the per-form secret when available.

### 7. Config — no new env vars needed (config.py)

No changes to `config.py`. The existing `cap_site_key` and `cap_secret_key` settings remain as the global fallback. Per-form keys are stored in the database.

### 8. Graceful degradation summary

- If Cap API is down during form creation → form is created without per-form keys, falls back to env var
- If a form has no `cap_site_key` → uses `settings.cap_site_key` (global fallback)
- If a form has no `cap_site_secret` → uses `settings.cap_secret_key` for verification
- If Cap is entirely unconfigured (`CAP_ENDPOINT` missing) → no provisioning attempted, existing behavior preserved

## Files to modify

| File | Change |
|------|--------|
| `app/db.py` | Add `cap_site_key VARCHAR(255)` and `cap_site_secret VARCHAR(255)` columns to forms table |
| `app/cap_api.py` | NEW — Cap API client with `create_cap_site_key()` function |
| `app/forms.py` | Auto-provision Cap site key on form creation |
| `app/captcha.py` | Support per-form secret key in verification |
| `app/main.py` | Pass per-form secret to captcha verification |
| `app/templates/embed_snippet.html` | Use per-form site key (static + JS) |
| `app/templates/public_form.html` | Use per-form site key |

## Verification

1. Run `python -c "from app import *; print('import ok')"` from project root
2. Run `npm run build` if applicable (or check Python syntax)
3. The embed snippet page should display per-form cap-proxy URLs
4. Existing forms without cap_site_key fall back to settings.cap_site_key
