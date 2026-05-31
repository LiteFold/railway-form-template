import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


async def create_cap_site_key(slug: str, endpoint: str, admin_key: str) -> Optional[dict]:
    """
    Attempt to create a Cap site key for a form via the admin API.
    
    Requires a pre-existing API key with Bot auth privileges.
    Falls back gracefully — returns None if not possible.
    """
    # Cap server does not expose a public endpoint for programmatic 
    # site key creation through API keys. Keys must be created via the 
    # Cap web UI admin panel. This function is a no-op that returns None,
    # causing the caller to fall back to the global CAP_SITE_KEY env var.
    logger.info(f"Cap auto-provisioning not supported for slug '{slug}' — use global CAP_SITE_KEY instead")
    return None
