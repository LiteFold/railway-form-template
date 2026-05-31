import logging

from app.cap_api import create_cap_site_key
from app.config import settings

logger = logging.getLogger(__name__)


async def auto_provision(pool, slug: str, endpoint: str = None, admin_key: str = None) -> bool:
    endpoint = endpoint or settings.cap_endpoint
    admin_key = admin_key or settings.cap_secret_key
    if not (endpoint and admin_key):
        return False

    try:
        cap_result = await create_cap_site_key(slug, endpoint, admin_key)
        if cap_result and cap_result.get("site_key"):
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE forms SET cap_site_key = $1, cap_site_secret = $2 WHERE slug = $3",
                    cap_result["site_key"], cap_result["secret_key"], slug,
                )
            return True
        else:
            logger.warning("Failed to auto-provision CAPTCHA site key for form '%s'", slug)
            return False
    except Exception:
        logger.warning("Failed to auto-provision CAPTCHA site key for form '%s'", slug)
        return False


async def auto_provision_new_form(pool, slug: str, form_data: dict) -> dict:
    success = await auto_provision(pool, slug)
    if success:
        from app.forms import get_form_by_slug
        return await get_form_by_slug(pool, slug)
    return form_data


def is_cap_configured() -> bool:
    return bool(settings.cap_endpoint and settings.cap_secret_key)
