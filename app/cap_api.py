import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


async def create_cap_site_key(slug: str, endpoint: str, admin_key: str) -> Optional[dict]:
    """
    Create a Cap site key for a form.

    Cap API flow:
    1. POST /auth/login with admin_key to get a session cookie
    2. PUT /server/keys/{slug}/config to create the key (cookie-based auth)

    The slug itself becomes the site key identifier.
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
                logger.warning("Cap login returned success=false")
                return None

            # httpx handles session cookies automatically
            # Step 2: Create the site key — slug is the key identifier
            create_resp = await client.put(
                f"{base}/server/keys/{slug}/config",
                json={
                    "siteName": slug,
                    "allowedOrigins": ["*"],
                },
            )
            if create_resp.status_code not in (200, 201):
                logger.warning(
                    f"Cap key creation failed: {create_resp.status_code} {create_resp.text}"
                )
                return None

            # The Cap server uses the name/slug as the site key identifier
            return {"site_key": slug, "secret_key": ""}
    except Exception as e:
        logger.warning(f"Cap API request failed: {e}")
        return None
