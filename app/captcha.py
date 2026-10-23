import hashlib
import json
import secrets
import time
from typing import Optional
from urllib.parse import urljoin

import httpx

from app.config import settings


def _make_challenge(difficulty: int = 4) -> dict:
    secret = secrets.token_hex(16)
    prefix = "0" * difficulty
    nonce = 0
    while True:
        candidate = f"{secret}{nonce}"
        h = hashlib.sha256(candidate.encode()).hexdigest()
        if h.startswith(prefix):
            return {"secret": secret, "nonce": nonce, "difficulty": difficulty}
        nonce += 1


def _verify_pow(secret: str, nonce: int, difficulty: int) -> bool:
    candidate = f"{secret}{nonce}"
    h = hashlib.sha256(candidate.encode()).hexdigest()
    return h.startswith("0" * difficulty)


async def verify_cap(token: str, secret_key: Optional[str] = None) -> bool:
    secret = secret_key or settings.cap_secret_key
    if not settings.cap_endpoint or not secret:
        return False
    url = urljoin(settings.cap_endpoint.rstrip("/") + "/", "siteverify")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                url,
                json={"secret": secret, "response": token},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("success", False)
    except (httpx.RequestError, ValueError):
        pass
    return False


def verify_honeypot(data: dict) -> bool:
    hp = data.get("_hp_website", "")
    return hp == ""


async def verify_captcha(request, data: dict, cap_secret_key: Optional[str] = None) -> tuple[bool, Optional[str]]:
    mode = settings.captcha_mode

    if mode == "off":
        return True, None

    if mode == "cap":
        token = data.get("cap_token", "")
        if not token:
            return False, "CAPTCHA token missing"
        ok = await verify_cap(token, cap_secret_key)
        return ok, None if ok else "CAPTCHA verification failed"

    if mode == "honeypot":
        ok = verify_honeypot(data)
        return ok, None if ok else "Honeypot triggered"

    if mode == "pow":
        secret = data.get("pow_secret", "")
        nonce_str = data.get("pow_nonce", "0")
        difficulty = 4  # fixed server-side; never trust the client's value
        try:
            nonce = int(nonce_str)
        except (ValueError, TypeError):
            return False, "Invalid PoW parameters"
        ok = _verify_pow(secret, nonce, difficulty)
        return ok, None if ok else "PoW verification failed"

    if mode == "auto":
        cap_token = data.get("cap-token", data.get("cap_token", ""))
        if cap_token and settings.cap_endpoint and (cap_secret_key or settings.cap_secret_key):
            ok = await verify_cap(cap_token, cap_secret_key)
            if ok:
                return True, None

        if verify_honeypot(data):
            return True, None

        return False, "CAPTCHA verification failed"

    return False, "Unknown CAPTCHA mode"


def generate_pow_challenge(difficulty: int = 4) -> dict:
    return _make_challenge(difficulty)
