import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


async def create_cap_site_key(name: str, endpoint: str, secret_key: str) -> Optional[dict]:
    url = endpoint.rstrip("/") + "/sitekey"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json={"name": name, "allowed_domains": ["*"]},
                headers={"Authorization": f"Bearer {secret_key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return {"site_key": data.get("site_key"), "secret_key": data.get("secret_key")}
            else:
                logger.warning(f"Cap API returned status {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Cap API request failed: {e}")
    return None
