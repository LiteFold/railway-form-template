import csv
import io
from datetime import datetime, timezone

import json
import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from app.templates_ import TemplateResponse

import asyncpg
from app.config import settings
from app.forms import create_form, delete_form, get_form, get_form_by_slug, get_forms, update_form
from app.rate_limit import check_rate_limit

router = APIRouter()


async def require_pool(request: Request):
    pool = request.app.state.pool
    if pool is None:
        warning = request.session.pop("warning", None)
        if warning is None and settings.admin_password is None:
            warning = "ADMIN_PASSWORD not set — using default auth"
        return await TemplateResponse(
            "admin_dashboard.html",
            {
                "request": request,
                "forms": [],
                "submissions": [],
                "page": 1,
                "total_pages": 1,
                "total": 0,
                "search": "",
                "form_slug": "",
                "warning": warning,
                "error": "Database not connected. The app is running in offline mode — form submissions require a PostgreSQL database.",
            },
        )
    return None


def auth_required(request: Request):
    if not request.session.get("authenticated"):
        if request.headers.get("HX-Request") == "true":
            raise HTTPException(status_code=200, headers={"HX-Redirect": "/admin/login"})
        raise HTTPException(status_code=303, headers={"Location": "/admin/login"})


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return await TemplateResponse("admin_login.html", {"request": request})


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
        request.session["warning"] = "ADMIN_PASSWORD not set — using default auth"
        return RedirectResponse(url="/admin", status_code=302)
    if password == settings.admin_password:
        request.session["authenticated"] = True
        return RedirectResponse(url="/admin", status_code=302)
    return await TemplateResponse(
        "admin_login.html",
        {"request": request, "error": "Invalid password"},
    )


@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/admin/login", status_code=302)


@router.get("", response_class=HTMLResponse)
async def dashboard(request: Request):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    forms = await get_forms(pool)

    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM submissions") or 0
        rows = await conn.fetch(
            "SELECT * FROM submissions ORDER BY created_at DESC LIMIT 20"
        )
        submissions = [dict(r) for r in rows]

    total_pages = max(1, (total + 19) // 20)

    warning = request.session.pop("warning", None)
    if warning is None and settings.admin_password is None:
        warning = "ADMIN_PASSWORD not set — using default auth"

    return await TemplateResponse(
        "admin_dashboard.html",
        {
            "request": request,
            "forms": forms,
            "submissions": submissions,
            "page": 1,
            "total_pages": total_pages,
            "total": total,
            "search": "",
            "form_slug": "",
            "warning": warning,
        },
    )


@router.get("/submissions", response_class=HTMLResponse)
async def submissions_list(
    request: Request,
    page: int = Query(1, ge=1),
    search: str = Query(""),
    form_slug: str = Query(""),
):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    per_page = 20
    offset = (page - 1) * per_page

    async with pool.acquire() as conn:
        where_clauses = []
        params = []
        if search:
            where_clauses.append(f"data::text ILIKE ${len(params)+1}")
            params.append(f"%{search}%")
        if form_slug:
            where_clauses.append(f"form_slug = ${len(params)+1}")
            params.append(form_slug)

        where = ""
        if where_clauses:
            where = "WHERE " + " AND ".join(where_clauses)

        count_row = await conn.fetchval(
            f"SELECT COUNT(*) FROM submissions {where}", *params
        )
        total = count_row or 0

        order = "ORDER BY created_at DESC"
        limit_clause = f"LIMIT {per_page} OFFSET {offset}"
        rows = await conn.fetch(
            f"SELECT * FROM submissions {where} {order} {limit_clause}",
            *params,
        )
        submissions = [dict(r) for r in rows]

    total_pages = max(1, (total + per_page - 1) // per_page)
    forms = await get_forms(pool)

    is_htmx = request.headers.get("HX-Request") == "true"
    template = "admin_submissions.html" if is_htmx else "admin_dashboard.html"

    return await TemplateResponse(
        template,
        {
            "request": request,
            "submissions": submissions,
            "page": page,
            "total_pages": total_pages,
            "total": total,
            "search": search,
            "form_slug": form_slug,
            "forms": forms,
            "partial": True,
        },
    )


@router.get("/submission/{sub_id}/toggle")
async def toggle_read(request: Request, sub_id: str):
    auth_required(request)
    # Validate UUID format
    try:
        uuid.UUID(sub_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Submission not found")
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE submissions SET is_read = NOT is_read WHERE id = $1 RETURNING is_read",
            sub_id,
        )
        is_read = row["is_read"] if row else False
    return Response(status_code=200, headers={"HX-Refresh": "true"})


@router.get("/submission/{sub_id}", response_class=HTMLResponse)
async def submission_detail(request: Request, sub_id: str):
    auth_required(request)
    # Validate UUID format before hitting the database
    try:
        uuid.UUID(sub_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Submission not found")
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM submissions WHERE id = $1", sub_id
            )
    except asyncpg.exceptions.DataError:
        raise HTTPException(status_code=404, detail="Submission not found")
    if row is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission = dict(row)
    is_htmx = request.headers.get("HX-Request") == "true"
    template = "admin_submission_detail.html" if is_htmx else "admin_dashboard.html"

    return await TemplateResponse(
        template,
        {
            "request": request,
            "submission_detail": submission,
        },
    )


@router.delete("/submission/{sub_id}")
async def delete_submission(request: Request, sub_id: str, form_slug: str | None = None):
    auth_required(request)
    # Validate UUID format
    try:
        uuid.UUID(sub_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Submission not found")
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM submissions WHERE id = $1", sub_id)
        if form_slug:
            new_total = await conn.fetchval(
                "SELECT COUNT(*) FROM submissions WHERE form_slug = $1", form_slug
            ) or 0
        else:
            new_total = await conn.fetchval("SELECT COUNT(*) FROM submissions") or 0
    return HTMLResponse(
        content=f'<tr></tr><p id="total-count" hx-swap-oob="true">{new_total} total submissions</p>',
        status_code=200,
    )


@router.get("/export")
async def export_csv(request: Request):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM submissions ORDER BY created_at DESC"
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "form_slug", "data", "metadata", "is_read", "created_at"])
    for r in rows:
        writer.writerow([
            r["id"], r["form_slug"], json.dumps(r["data"]),
            json.dumps(r["metadata"]), r["is_read"], r["created_at"].isoformat(),
        ])

    output.seek(0)
    now = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=submissions_{now}.csv"},
    )


@router.get("/forms", response_class=HTMLResponse)
async def list_forms(request: Request):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    forms = await get_forms(pool)
    return await TemplateResponse(
        "admin_dashboard.html",
        {"request": request, "forms": forms, "show_forms": True},
    )


@router.get("/forms/new", response_class=HTMLResponse)
async def new_form_page(request: Request):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    return await TemplateResponse(
        "admin_dashboard.html",
        {"request": request, "editing_form": {"slug": "", "title": "Contact Form", "fields": []}},
    )


@router.post("/forms")
async def create_form_route(
    request: Request,
    slug: str = Form(...),
    title: str = Form("Contact Form"),
    fields_json: str = Form("[]"),
    post_submit_message: str = Form(""),
    redirect_url: str = Form(""),
):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    import json
    try:
        fields = json.loads(fields_json)
    except json.JSONDecodeError as e:
        return HTMLResponse(status_code=400, content=f"Invalid fields JSON: {e}")
    try:
        await create_form(pool, slug, title, fields, post_submit_message, redirect_url)
    except asyncpg.exceptions.UniqueViolationError:
        # Return the form editor with the submitted data preserved
        pool = request.app.state.pool
        forms = await get_forms(pool) if pool else []
        return await TemplateResponse(
            "admin_forms.html",
            {
                "request": request,
                "editing_form": {"slug": slug, "title": title, "fields": fields, "post_submit_message": post_submit_message, "redirect_url": redirect_url},
                "forms": forms,
                "slug_error": f"A form with slug '{slug}' already exists. Please choose a different slug.",
            },
        )
    forms = await get_forms(pool)
    return await TemplateResponse(
        "admin_forms.html",
        {"request": request, "forms": forms},
    )


@router.get("/form/{form_id}", response_class=HTMLResponse)
async def edit_form_page(request: Request, form_id: str):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    form = await get_form(pool, form_id)
    return await TemplateResponse(
        "admin_dashboard.html",
        {"request": request, "editing_form": form, "forms": [form]},
    )


@router.put("/form/{form_id}")
async def update_form_route(
    request: Request,
    form_id: str,
    title: str = Form("Contact Form"),
    fields_json: str = Form("[]"),
    post_submit_message: str = Form(""),
    redirect_url: str = Form(""),
):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    import json
    try:
        fields = json.loads(fields_json)
    except json.JSONDecodeError as e:
        return HTMLResponse(status_code=400, content=f"Invalid fields JSON: {e}")
    try:
        await update_form(pool, form_id, title, fields, post_submit_message, redirect_url)
    except asyncpg.exceptions.UniqueViolationError:
        return HTMLResponse(status_code=400, content="A form with this slug already exists.")
    # Return the form list directly instead of HX-Redirect for consistency
    forms = await get_forms(pool)
    return await TemplateResponse(
        "admin_forms.html",
        {"request": request, "forms": forms},
    )


@router.delete("/form/{form_id}")
async def delete_form_route(request: Request, form_id: str):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    ok = await delete_form(pool, form_id)
    return HTMLResponse(status_code=200, content="")
