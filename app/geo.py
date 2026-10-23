import datetime
import gzip
import ipaddress
import logging
import os
import shutil
import tempfile
import urllib.request
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

# DB-IP "IP to Country Lite" — free, CC BY 4.0, refreshed monthly.
DBIP_URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
DEFAULT_DB_PATH = os.path.join(tempfile.gettempdir(), "dbip-country-lite.mmdb")
MAX_DB_AGE_DAYS = 35

log = logging.getLogger(__name__)

_reader = None
_reader_loaded = False


def _db_path() -> str:
    return settings.geoip_db_path or DEFAULT_DB_PATH


def _download_dbip(dest: str) -> bool:
    """Fetch the latest monthly DB-IP file; falls back to last month early in a month."""
    today = datetime.date.today()
    last_month = (today.replace(day=1) - datetime.timedelta(days=1))
    for month in (today.strftime("%Y-%m"), last_month.strftime("%Y-%m")):
        url = DBIP_URL.format(month=month)
        tmp = dest + ".part"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "form-api"})
            with urllib.request.urlopen(req, timeout=60) as resp, gzip.GzipFile(fileobj=resp) as gz, open(tmp, "wb") as out:
                shutil.copyfileobj(gz, out)
            os.replace(tmp, dest)
            log.info("Downloaded GeoIP country database %s", url)
            return True
        except Exception as exc:
            log.warning("GeoIP download failed for %s: %s", url, exc)
            try:
                os.remove(tmp)
            except OSError:
                pass
    return False


def ensure_geoip_db() -> None:
    """Make sure a country database is on disk and loaded. Blocking — run off the event loop."""
    global _reader, _reader_loaded
    path = _db_path()
    fresh = os.path.exists(path) and (
        datetime.datetime.now().timestamp() - os.path.getmtime(path) < MAX_DB_AGE_DAYS * 86400
    )
    if not fresh and settings.geoip_auto_download:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        _download_dbip(path)
    if os.path.exists(path):
        try:
            import maxminddb
            _reader = maxminddb.open_database(path)
            _reader_loaded = True
        except Exception as exc:
            log.warning("Could not open GeoIP database %s: %s", path, exc)


def client_ip(request: Request) -> str:
    real = request.headers.get("x-real-ip", "").strip()
    if real:
        return real
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def get_client_ip(request: Request) -> str:
    """Real client IP. Forwarded headers are only trusted behind Railway's proxy."""
    if os.environ.get("RAILWAY_ENVIRONMENT"):
        ip = client_ip(request)
        if ip:
            return ip
    return request.client.host if request.client else "unknown"


def _get_reader():
    global _reader, _reader_loaded
    if not _reader_loaded:
        _reader_loaded = True
        path = _db_path()
        if os.path.exists(path):
            try:
                import maxminddb
                _reader = maxminddb.open_database(path)
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
