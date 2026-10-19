import ipaddress
from typing import Optional

from fastapi import Request

from app.config import settings

COUNTRY_HEADERS = (
    "cf-ipcountry",
    "x-vercel-ip-country",
    "cloudfront-viewer-country",
    "x-appengine-country",
    "x-country-code",
)

_reader = None
_reader_loaded = False


def client_ip(request: Request) -> str:
    real = request.headers.get("x-real-ip", "").strip()
    if real:
        return real
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def _get_reader():
    global _reader, _reader_loaded
    if not _reader_loaded:
        _reader_loaded = True
        if settings.geoip_db_path:
            try:
                import maxminddb
                _reader = maxminddb.open_database(settings.geoip_db_path)
            except Exception:
                _reader = None
    return _reader


def resolve_country(request: Request) -> Optional[str]:
    for header in COUNTRY_HEADERS:
        code = request.headers.get(header, "").strip().upper()
        # XX/T1 are Cloudflare's "unknown" and "Tor" markers
        if len(code) == 2 and code.isalpha() and code not in ("XX", "T1"):
            return code

    reader = _get_reader()
    if reader is None:
        return None
    ip = client_ip(request)
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if addr.is_private or addr.is_loopback or addr.is_reserved:
        return None
    try:
        record = reader.get(ip) or {}
    except Exception:
        return None
    code = (record.get("country") or {}).get("iso_code")
    return code.upper() if code else None
