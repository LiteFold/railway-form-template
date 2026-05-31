# Spec: Fix Cap API integration for per-form site key provisioning

## Problem

The `app/cap_api.py` function `create_cap_site_key()` tries to create a Cap site key by calling `POST {cap_endpoint}/sitekey` with a `Bearer` token. The Cap standalone server uses a different API:

1. **Login first:** `POST /auth/login` with `{"admin_key": "<secret>"}` → returns a `cap_authed` session cookie
2. **Create key:** `PUT /server/keys/{name}/config` (authenticated via session cookie) → creates the site key
3. **Get the key ID:** The key is stored under `{name}` — the `PUT` response returns `{"success": true}` and the key is now available at `POST /{name}/challenge`

Note: The Cap server's site key identifier IS the name/slug you provide, not a generated ID. When you create a key named "contact", the challenge endpoint becomes `POST /contact/challenge`. But the Cap server also generates an internal `siteKey` ID. We need to store the correct identifier.

### Tested working

From earlier testing:
```
POST /contact/challenge → {"error": "Invalid site key or secret"}        # Before key creation
POST /auth/login → {"success": true, "session_token": "..."}              # Login works
PUT /server/keys/contact/config → ...                                     # Key creation via admin
POST /contact/challenge → {"challenge": {...}, "token": "..."}            # After key creation — WORKS
```

## Files to change

### `app/cap_api.py` — Complete rewrite

```python
import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


async def create_cap_site_key(slug: str, endpoint: str, admin_key: str) -> Optional[dict]:
    """
    Create a Cap site key for a form.
    Returns dict with site_key and secret_key, or None on failure.
    """
    base = endpoint.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Step 1: Login to Cap admin
            login_resp = await client.post(
                f"{base}/auth/login",
                json={"admin_key": admin_key},
            )
            if login_resp.status_code != 200:
                logger.warning(f"Cap login failed: {login_resp.status_code}")
                return None
            login_data = login_resp.json()
            if not login_data.get("success"):
                return None

            # Step 2: Create the key — Cap server uses slug as site key name
            # The session cookie is automatically managed by httpx
            create_resp = await client.put(
                f"{base}/server/keys/{slug}/config",
                json={
                    "siteName": slug,
                    "allowedOrigins": ["*"],
                },
            )
            if create_resp.status_code not in (200, 201):
                logger.warning(f"Cap key creation failed: {create_resp.status_code} {create_resp.text}")
                return None

            # The site key ID is the slug itself (Cap uses the name as the key identifier)
            return {"site_key": slug, "secret_key": ""}
    except Exception as e:
        logger.warning(f"Cap API request failed: {e}")
        return None
```

### `app/templates/embed_snippet.html`

The embed snippet template already uses `forms[0].cap_site_key or settings.cap_site_key` as a fallback. For the per-form key to work, the template needs to pass the selected form's cap_site_key to the JavaScript snippet update function.

The template should use the form's `cap_site_key` when available, falling back to `settings.cap_site_key`.

### Backfill for existing forms

Existing forms don't have `cap_site_key` stored. A management command or migration script should be created, or the existing forms will continue to use the global `CAP_SITE_KEY` fallback.

## Verification

1. Create a new form in the admin dashboard
2. Check the form's embed snippet — `data-cap-api-endpoint` should include the form's slug as the site key (e.g., `cap-proxy/my-new-form/`)
3. The Cap CAPTCHA should work on the new form's embedded page
4. Create a second form — should work independently
5. Existing forms should still work via the global `CAP_SITE_KEY` fallback
