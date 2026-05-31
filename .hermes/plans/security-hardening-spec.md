# Spec: Security hardening — login rate limiting + session cookie flags

## Problem

Two security gaps identified in audit:

1. **No brute-force protection on `/admin/login`** — an attacker can submit unlimited password guesses. The form rate limiting (`check_rate_limit`) already exists for the public form but the login endpoint bypasses it.

2. **Session cookie uses defaults** — `SessionMiddleware` is instantiated without explicit `https_only` or `same_site` flags. The cookie works over HTTP in theory (though Railway serves HTTPS). Adding explicit flags hardens against session theft.

## Changes

### File 1: `app/main.py` — Session cookie flags

**Line 51, change:**
```python
# Before:
app.add_middleware(SessionMiddleware, secret_key=secret_key)

# After:
app.add_middleware(
    SessionMiddleware,
    secret_key=secret_key,
    https_only=True,
    same_site="lax",
)
```

### File 2: `app/admin.py` — Login rate limiting

Add rate limiting to the login route. Reuse the existing `check_rate_limit` function from `app/rate_limit.py`:

**In the import section (line 13), add:**
```python
from app.rate_limit import check_rate_limit
```

**In the `login` route (line 56-67), add rate limiting before password check:**
```python
@router.post("/login")
async def login(request: Request, password: str = Form(...)):
    pool = request.app.state.pool
    ip = request.client.host if request.client else "unknown"

    # Rate limit login attempts
    if pool:
        allowed = await check_rate_limit(pool, ip, prefix="login:")
        if not allowed:
            return await TemplateResponse(
                "admin_login.html",
                {"request": request, "error": "Too many login attempts. Try again later."},
            )

    if settings.admin_password is None:
        request.session["authenticated"] = True
        ...
```

The `check_rate_limit` function currently hardcodes a key prefix. Either:
- Add an optional `prefix` parameter to `check_rate_limit` (default `"ratelimit:"`)
- Or create a separate `check_login_rate_limit` function

Option 1 is cleaner — add `prefix: str = "ratelimit:"` to `check_rate_limit` signature in `app/rate_limit.py` and pass `prefix="login:"` from the login route.

### File 3: `app/rate_limit.py` — Optional prefix

**Current signature (line ~20):**
```python
async def check_rate_limit(pool, ip: str) -> bool:
```

**Change to:**
```python
async def check_rate_limit(pool, ip: str, prefix: str = "ratelimit:") -> bool:
```

And update the key construction to use the prefix instead of hardcoding `ratelimit:`.

## Verification

1. Open `/admin/login` — page loads normally
2. Submit wrong password > 10 times — should show "Too many login attempts"
3. Wait — after rate limit window, login should work again
4. Check session cookie in browser DevTools → Application → Cookies:
   - `Secure` flag should be set (HTTPS only)
   - `SameSite` should be `Lax`
5. Normal form submissions should still work (rate limiting unchanged for public endpoint)
