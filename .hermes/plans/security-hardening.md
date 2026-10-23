# Security hardening

Scope: ONLY modify `app/`, `template-editor-raw.json`, `.env.sample`, `README.md`. Do not touch `e2e/`, `.hermes/`.
No added CAPTCHA friction: honeypot stays the default; do not add visitor-facing challenges.

## Critical
1. `app/admin.py` `login()` (~L70): remove the "ADMIN_PASSWORD unset => authenticated" branch. If unset, return the login page with error
   "Admin login disabled: set ADMIN_PASSWORD" (status 503), never set the session. Remove the "using default auth" warnings
   (`require_pool`, `dashboard`).
2. `app/main.py` L69: if `SESSION_SECRET_KEY` unset, derive a stable key = `sha256("session:" + admin_password)` hex when admin_password is set
   (survives restarts/replicas); only fall back to `secrets.token_hex(32)` when both unset. Log a warning in the fallback case.

## High
3. `app/mcp_server.py` `_ApiKeyAuth`: add in-memory failed-attempt limiter per client IP (`scope["client"][0]`): 10 failures / 15 min => 429
   with `Retry-After`. Successful auth does not count. Re-enable DNS rebinding protection only if trivial; otherwise leave and keep comment.
4. `app/admin.py` L74: compare with `hmac.compare_digest` on encoded bytes. Add `max_age=8*3600` to `SessionMiddleware` in `main.py`.
5. Rate limiting:
   - `app/rate_limit.py` `check_rate_limit_db` is broken (each call inserts a new row keyed by NOW(), so count is always 1 and the limit never trips).
     Rewrite: `SELECT COALESCE(SUM(count),0)` over the last hour for `prefix+ip`; reject if >= limit; else insert row.
     Also purge rows older than 1 hour opportunistically.
   - Real client IP: add `get_client_ip(request)` in `app/geo.py`-style helper (reuse `client_ip`) but only trust `x-real-ip` /
     `x-forwarded-for` when env `RAILWAY_ENVIRONMENT` is set (Railway proxy). Use it in `admin.login`, `main.submit_form`.
     Otherwise use `request.client.host`. Document in `.env.sample`.
   - `template-editor-raw.json`: set `RATE_LIMIT_BACKEND` default to `"db"`. Fix RATE_LIMIT description ("per hour", not per minute).

## Medium
6. `main.py` CORS: set `allow_credentials=False` (admin uses same-origin cookies; public form posts need no credentials).
7. Toggle read state: change `GET /admin/submission/{id}/toggle` to `POST`; update `hx-get` -> `hx-post` in
   `templates/admin_submissions.html` (L49) and `templates/admin_submission_detail.html` (L12).
8. PoW (`/pow-challenge`, `captcha.py`): clamp `difficulty` to 1..4 in the endpoint; in `_verify_pow` path ignore client `pow_difficulty`
   and use fixed 4 (`max(4, ...)` not allowed — just constant 4). Keep `pow` mode otherwise unchanged.
9. Remove `/cap-proxy/{path}` route from `main.py` (SSRF). Remove now-unused imports (`urljoin`, `httpx` if unused). Remove `cap-proxy`
   references in `templates/embed_snippet.html` and `templates/public_form.html` cap widget branches only if they break without it;
   keep honeypot/pow paths intact.

## Low
10. `main.py`: wrap `success_msg` and captcha `msg` with `html.escape()` before interpolating into HTML.
11. `templates/admin_forms.html`: add an `esc()` JS helper (escape & < > " ') and use it for label, placeholder, options values in the
    `render()` string building (~L244, L260, L268).

## Done when
- `python -c "import app.main"` passes.
- Login with unset ADMIN_PASSWORD no longer authenticates; wrong password rejected; correct password works.
- `git diff --stat` touches only the files named above.
