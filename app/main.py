import json
import secrets
import uuid
from contextlib import asynccontextmanager
from urllib.parse import urljoin
import httpx
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from app.templates_ import TemplateResponse
from starlette.middleware.sessions import SessionMiddleware
from app import db as db_module
from app.admin import router as admin_router
from app.captcha import generate_pow_challenge, verify_captcha
from app.config import settings
from app.email_ import send_notification
from app.forms import get_form_by_slug, get_forms
from app.rate_limit import check_rate_limit, ensure_rate_limit_table

def _wants_html(request: Request) -> bool:
    if request.headers.get("hx-request") == "true":
        return True
    accept = request.headers.get("accept", "")
    return "text/html" in accept or "application/xhtml" in accept or accept == "*/*"

@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await db_module.create_pool()
    app.state.pool = pool
    if pool:
        await db_module.init_db(pool)
        if settings.rate_limit_backend == "db":
            await ensure_rate_limit_table(pool)
    yield
    if pool:
        await pool.close()
app = FastAPI(
    title="Easy Form",
    version="1.0.0",
    lifespan=lifespan,
)

@app.middleware("http")
async def enforce_https_scheme(request: Request, call_next):
    if request.scope.get("scheme") == "http":
        request.scope["scheme"] = "https"
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
secret_key = settings.session_secret_key or secrets.token_hex(32)
app.add_middleware(
    SessionMiddleware,
    secret_key=secret_key,
    https_only=True,
    same_site="lax",
)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(admin_router, prefix="/admin")
@app.get("/", response_class=HTMLResponse)
async def embed_snippet(request: Request):
    pool = request.app.state.pool
    if pool is None:
        return await TemplateResponse(
            "embed_snippet.html",
            {"request": request, "forms": [], "settings": settings},
        )
    forms = await get_forms(pool)
    return await TemplateResponse(
        "embed_snippet.html",
        {"request": request, "forms": forms, "settings": settings},
    )
@app.get("/health")
async def health(request: Request):
    pool = request.app.state.pool
    db_ok = False
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
                db_ok = True
        except Exception:
            pass
    return {
        "status": "healthy",
        "database": "connected" if db_ok else "disconnected",
    }
@app.get("/form/{slug}", response_class=HTMLResponse)
async def public_form(request: Request, slug: str):
    pool = request.app.state.pool
    if pool is None:
        if _wants_html(request):
            return HTMLResponse(status_code=503, content='<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Database not available</div>')
        raise HTTPException(status_code=503, detail="Database not available")
    form_def = await get_form_by_slug(pool, slug)
    if not form_def:
        if _wants_html(request):
            return HTMLResponse(status_code=404, content='<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Form not found</div>')
        raise HTTPException(status_code=404, detail="Form not found")
    return await TemplateResponse(
        "public_form.html",
        {"request": request, "form": form_def, "settings": settings},
    )
@app.post("/form/{slug}")
async def submit_form(request: Request, slug: str):
    pool = request.app.state.pool
    if pool is None:
        if _wants_html(request):
            return HTMLResponse(status_code=503, content='<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Database not available</div>')
        raise HTTPException(status_code=503, detail="Database not available")
    form_def = await get_form_by_slug(pool, slug)
    if not form_def:
        if _wants_html(request):
            return HTMLResponse(status_code=404, content='<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Form not found</div>')
        raise HTTPException(status_code=404, detail="Form not found")
    ip = request.client.host if request.client else "unknown"
    allowed = await check_rate_limit(pool, ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
            headers={"Retry-After": "3600"},
        )
    try:
        body = await request.form()
        data = dict(body)
    except Exception:
        try:
            body = await request.json()
            data = dict(body)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request body")

    if not data:
        if _wants_html(request):
            return HTMLResponse(status_code=200, content='<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">No form data submitted</div>')
        raise HTTPException(status_code=400, detail="No form data submitted")

    submission_data = {}
    email_val = ""
    name_val = ""
    for field in form_def["fields"]:
        fname = field.get("name")
        is_required = field.get("required", False)
        if fname not in data:
            if is_required:
                if _wants_html(request):
                    return HTMLResponse(status_code=200, content=f'<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Field "{field.get("label", fname)}" is required</div>')
                raise HTTPException(status_code=400, detail=f"Field '{field.get('label', fname)}' is required")
            continue
        val = data[fname]
        if isinstance(val, str):
            val = val.strip()
        if is_required and not val:
            if _wants_html(request):
                return HTMLResponse(status_code=200, content=f'<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Field "{field.get("label", fname)}" is required</div>')
            raise HTTPException(status_code=400, detail=f"Field '{field.get('label', fname)}' is required")
        submission_data[fname] = val
        if field.get("type") == "email":
            email_val = val
        if fname == "name":
            name_val = val

    # Fix 1: Check for unexpected/honeypot fields BEFORE popping system fields
    form_field_names = {f.get("name") for f in form_def["fields"]}
    system_fields = {"cap_token", "cap-token", "pow_secret", "pow_nonce", "pow_difficulty", "_hp_website"}
    allowed_fields = form_field_names | system_fields
    unexpected = [k for k in data if k not in allowed_fields]
    if unexpected:
        if _wants_html(request):
            return HTMLResponse(status_code=200, content=f'<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px">Unexpected field detected</div>')
        raise HTTPException(status_code=400, detail="Unexpected field detected")

    # Fix 1 (continued): Check captcha/honeypot BEFORE popping system fields
    captcha_ok, captcha_err = await verify_captcha(request, data, form_def.get("cap_site_secret"))
    if not captcha_ok:
        if _wants_html(request):
            msg = captcha_err or "CAPTCHA verification failed"
            html = '<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:6px;margin-bottom:16px">' + msg + '</div>'
            return HTMLResponse(status_code=200, content=html)
        raise HTTPException(status_code=400, detail=captcha_err or "CAPTCHA failed")

    # Pop system fields (cleanup before DB insert)
    data.pop("cap_token", None)
    data.pop("pow_secret", None)
    data.pop("pow_nonce", None)
    data.pop("pow_difficulty", None)
    data.pop("_hp_website", None)
    metadata = {
        "ip": ip,
        "user_agent": request.headers.get("user-agent", ""),
        "referer": request.headers.get("referer", ""),
    }
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO submissions (form_slug, data, metadata) VALUES ($1, $2, $3)",
            slug, json.dumps(submission_data), json.dumps(metadata),
        )
    if settings.form_recipient_email:
        await send_notification(name_val, email_val, submission_data.get("message", ""))
    if _wants_html(request):
        return HTMLResponse(
            '<div class="success">Thank you! Your submission was received.</div>'
        )
    return JSONResponse(
        status_code=201,
        content={"status": "ok", "message": "Form submitted successfully"},
    )
@app.get("/pow-challenge")
async def pow_challenge(difficulty: int = 4):
    challenge = generate_pow_challenge(difficulty)
    return challenge


@app.api_route("/cap-proxy/{path:path}", methods=["GET", "POST", "OPTIONS", "HEAD"])
async def cap_proxy(path: str, request: Request):
    """Proxy requests to the Cap CAPTCHA service, adding CORS headers."""
    if not settings.cap_endpoint:
        return JSONResponse(status_code=503, content={"error": "CAP endpoint not configured"})
    target_url = urljoin(settings.cap_endpoint.rstrip("/") + "/", path)
    async with httpx.AsyncClient() as client:
        resp = await client.request(
            method=request.method,
            url=target_url,
            content=await request.body(),
            headers={k: v for k, v in request.headers.items()
                     if k.lower() not in ("host", "content-length", "transfer-encoding", "connection")},
            params=request.query_params,
        )
    excluded = {"content-encoding", "content-length", "transfer-encoding", "connection"}
    headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
    return Response(content=resp.content, status_code=resp.status_code, headers=headers)
