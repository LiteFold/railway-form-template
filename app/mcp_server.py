import hmac
import os
import re
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal, Optional

import asyncpg
from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
from starlette.routing import Route

from app import forms as forms_db
from app.analytics import compute_charts, compute_overview
from app.config import settings

FIELD_TYPES = ("text", "email", "textarea", "select", "checkbox", "tel", "number", "url")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,99}$")
MAX_PAGE = 100

READ = ToolAnnotations(read_only_hint=True, open_world_hint=False)
WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)
DESTRUCTIVE = ToolAnnotations(read_only_hint=False, destructive_hint=True, idempotent_hint=True, open_world_hint=False)

mcp = MCPServer(
    name="Easy Form",
    instructions=(
        "Manage a self-hosted forms and leads platform. Forms are identified by slug. "
        "Use list_forms first to discover slugs and field names, list_submissions to see who filled a form, "
        "get_analytics for totals, trends, countries and per-field answer breakdowns, and build_chart to "
        "cross-tabulate fields against time, weekday, hour or country. Dates are YYYY-MM-DD."
    ),
)

_pool: Optional[asyncpg.Pool] = None


def set_pool(pool: Optional[asyncpg.Pool]) -> None:
    global _pool
    _pool = pool


def _db() -> asyncpg.Pool:
    if _pool is None:
        raise ToolError("Database is not connected")
    return _pool


def _public_base_url() -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
    return f"https://{domain}" if domain else ""


def _iso(value):
    return value.isoformat() if isinstance(value, (datetime, date)) else value


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "field"


def _form_summary(form: dict, submissions: int | None = None, unread: int | None = None) -> dict:
    base = _public_base_url()
    out = {
        "slug": form["slug"],
        "title": form["title"],
        "fields": form.get("fields") or [],
        "post_submit_message": form.get("post_submit_message") or "",
        "redirect_url": form.get("redirect_url") or "",
        "created_at": _iso(form.get("created_at")),
        "updated_at": _iso(form.get("updated_at")),
        "submit_endpoint": f"{base}/form/{form['slug']}" if base else f"/form/{form['slug']}",
        "hosted_form_url": f"{base}/form/{form['slug']}" if base else f"/form/{form['slug']}",
    }
    if submissions is not None:
        out["submissions"] = submissions
        out["unread"] = unread
    return out


def _submission(row) -> dict:
    data = row["data"] if isinstance(row["data"], dict) else {}
    meta = row["metadata"] if isinstance(row["metadata"], dict) else {}
    return {
        "id": str(row["id"]),
        "form_slug": row["form_slug"],
        "submitted_at": _iso(row["created_at"]),
        "is_read": row["is_read"],
        "country": meta.get("country"),
        "data": data,
    }


def _uuid(value: str, what: str = "submission") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        raise ToolError(f"Invalid {what} id: {value}")


def _date(value: Optional[str], name: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ToolError(f"{name} must be YYYY-MM-DD, got {value!r}")


async def _require_form(slug: str) -> dict:
    form = await forms_db.get_form_by_slug(_db(), slug)
    if not form:
        raise ToolError(f"No form with slug {slug!r}. Use list_forms to see available forms.")
    return form


async def _analytics_call(coro):
    try:
        return await coro
    except HTTPException as exc:
        raise ToolError(str(exc.detail))


# ---------- form field input ----------

class FieldSpec(BaseModel):
    label: str = Field(description="Question shown to the person filling the form")
    type: Literal["text", "email", "textarea", "select", "checkbox", "tel", "number", "url"] = "text"
    name: Optional[str] = Field(None, description="Storage key; derived from the label if omitted")
    required: bool = False
    options: Optional[list[str]] = Field(None, description="Choices, required for type 'select'")
    placeholder: Optional[str] = None


def _normalize_fields(fields: list[FieldSpec]) -> list[dict]:
    if not fields:
        raise ToolError("A form needs at least one field")
    out, seen = [], set()
    for f in fields:
        label = f.label.strip()
        if not label:
            raise ToolError("Every field needs a label")
        name = _slugify(f.name or label)
        if name in seen:
            raise ToolError(f"Duplicate field name {name!r}; give one of them a different name")
        seen.add(name)
        item: dict[str, Any] = {"name": name, "label": label[:200], "type": f.type, "required": f.required}
        if f.type == "select":
            options = [o.strip() for o in (f.options or []) if o and o.strip()]
            if not options:
                raise ToolError(f"Select field {label!r} needs at least one option")
            item["options"] = options
        if f.placeholder:
            item["placeholder"] = f.placeholder[:200]
        out.append(item)
    return out


# ---------- forms ----------

@mcp.tool(annotations=READ)
async def list_forms() -> dict:
    """List every form with its fields, submission counts and public submit URL."""
    pool = _db()
    forms = await forms_db.get_forms(pool)
    async with pool.acquire() as conn:
        counts = {
            r["form_slug"]: (r["total"], r["unread"])
            for r in await conn.fetch(
                "SELECT form_slug, COUNT(*) AS total, COUNT(*) FILTER (WHERE NOT is_read) AS unread "
                "FROM submissions GROUP BY form_slug"
            )
        }
    return {"forms": [_form_summary(f, *counts.get(f["slug"], (0, 0))) for f in forms]}


@mcp.tool(annotations=READ)
async def get_form(slug: str) -> dict:
    """Get one form's definition, URLs and submission counts."""
    form = await _require_form(slug)
    async with _db().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE NOT is_read) AS unread "
            "FROM submissions WHERE form_slug = $1", slug,
        )
    return _form_summary(form, row["total"], row["unread"])


@mcp.tool(annotations=WRITE)
async def create_form(
    slug: str,
    title: str,
    fields: list[FieldSpec],
    post_submit_message: str = "",
    redirect_url: str = "",
) -> dict:
    """Create a new form. slug becomes the URL (/form/<slug>): lowercase letters, digits, '-' or '_'."""
    slug = slug.strip().lower()
    if not SLUG_RE.match(slug):
        raise ToolError("slug must be 1-100 chars: lowercase letters, digits, '-' or '_', starting with a letter or digit")
    if redirect_url and not redirect_url.startswith(("http://", "https://")):
        raise ToolError("redirect_url must start with http:// or https://")
    try:
        form = await forms_db.create_form(
            _db(), slug, title.strip()[:255] or "Contact Form", _normalize_fields(fields),
            post_submit_message, redirect_url,
        )
    except asyncpg.exceptions.UniqueViolationError:
        raise ToolError(f"A form with slug {slug!r} already exists")
    return _form_summary(form, 0, 0)


@mcp.tool(annotations=WRITE)
async def update_form(
    slug: str,
    title: Optional[str] = None,
    fields: Optional[list[FieldSpec]] = None,
    post_submit_message: Optional[str] = None,
    redirect_url: Optional[str] = None,
) -> dict:
    """Update a form. Omitted arguments keep their current value; 'fields' replaces the whole field list."""
    form = await _require_form(slug)
    if redirect_url and not redirect_url.startswith(("http://", "https://")):
        raise ToolError("redirect_url must start with http:// or https://")
    updated = await forms_db.update_form(
        _db(),
        str(form["id"]),
        (title.strip()[:255] if title else None) or form["title"],
        _normalize_fields(fields) if fields is not None else form["fields"],
        (form.get("post_submit_message") or "") if post_submit_message is None else post_submit_message,
        (form.get("redirect_url") or "") if redirect_url is None else redirect_url,
    )
    return _form_summary(updated)


@mcp.tool(annotations=DESTRUCTIVE)
async def delete_form(slug: str, confirm: bool = False) -> dict:
    """Permanently delete a form AND all of its submissions. Requires confirm=true."""
    form = await _require_form(slug)
    async with _db().acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM submissions WHERE form_slug = $1", slug)
    if not confirm:
        return {
            "deleted": False,
            "message": f"This would delete form {slug!r} and {count} submissions. Call again with confirm=true.",
        }
    await forms_db.delete_form(_db(), str(form["id"]))
    return {"deleted": True, "slug": slug, "submissions_deleted": count}


# ---------- submissions ----------

@mcp.tool(annotations=READ)
async def list_submissions(
    form_slug: Optional[str] = None,
    search: Optional[str] = None,
    unread_only: bool = False,
    country: Annotated[Optional[str], Field(description="ISO 3166 two-letter code, e.g. 'US'")] = None,
    start_date: Annotated[Optional[str], Field(description="Inclusive, YYYY-MM-DD (UTC)")] = None,
    end_date: Annotated[Optional[str], Field(description="Inclusive, YYYY-MM-DD (UTC)")] = None,
    limit: int = 25,
    offset: int = 0,
) -> dict:
    """See who filled a form: newest submissions first, with their answers, country and read status.
    'search' matches any answer text (e.g. a name or email)."""
    where, params = [], []

    def add(clause: str, value):
        params.append(value)
        where.append(clause.replace("?", f"${len(params)}"))

    if form_slug:
        add("form_slug = ?", form_slug)
    if search:
        add("data::text ILIKE ?", f"%{search}%")
    if unread_only:
        where.append("NOT is_read")
    if country:
        add("UPPER(metadata->>'country') = ?", country.strip().upper())
    start, end = _date(start_date, "start_date"), _date(end_date, "end_date")
    if start:
        add("created_at >= ?", datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc))
    if end:
        add("created_at < ?", datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))

    clause = ("WHERE " + " AND ".join(where)) if where else ""
    limit = max(1, min(limit, MAX_PAGE))
    offset = max(0, offset)
    async with _db().acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM submissions {clause}", *params)
        rows = await conn.fetch(
            f"SELECT * FROM submissions {clause} ORDER BY created_at DESC LIMIT {limit} OFFSET {offset}",
            *params,
        )
    return {
        "total": total,
        "offset": offset,
        "returned": len(rows),
        "has_more": offset + len(rows) < total,
        "submissions": [_submission(r) for r in rows],
    }


@mcp.tool(annotations=READ)
async def get_submission(submission_id: str) -> dict:
    """Get one submission with all answers and metadata (country, IP, browser, referrer)."""
    async with _db().acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM submissions WHERE id = $1", _uuid(submission_id))
    if row is None:
        raise ToolError(f"Submission {submission_id} not found")
    out = _submission(row)
    out["metadata"] = row["metadata"] if isinstance(row["metadata"], dict) else {}
    return out


@mcp.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True, open_world_hint=False))
async def mark_submissions_read(submission_ids: list[str], read: bool = True) -> dict:
    """Mark one or more submissions as read (or unread with read=false)."""
    ids = [_uuid(s) for s in submission_ids][:500]
    if not ids:
        raise ToolError("Pass at least one submission id")
    async with _db().acquire() as conn:
        result = await conn.execute(
            "UPDATE submissions SET is_read = $1 WHERE id = ANY($2::uuid[])", read, ids,
        )
    return {"updated": int(result.split()[-1]), "is_read": read}


@mcp.tool(annotations=DESTRUCTIVE)
async def delete_submission(submission_id: str, confirm: bool = False) -> dict:
    """Permanently delete one submission. Requires confirm=true."""
    sid = _uuid(submission_id)
    if not confirm:
        return {"deleted": False, "message": "Call again with confirm=true to permanently delete this submission."}
    async with _db().acquire() as conn:
        result = await conn.execute("DELETE FROM submissions WHERE id = $1", sid)
    if result.endswith(" 0"):
        raise ToolError(f"Submission {submission_id} not found")
    return {"deleted": True, "id": submission_id}


# ---------- analytics ----------

def _series(chart: dict) -> list:
    return [[label, value] for label, value in zip(chart["labels"], chart["datasets"][0]["data"])]


@mcp.tool(annotations=READ)
async def get_analytics(
    form_slug: Annotated[Optional[str], Field(description="Omit for all forms combined")] = None,
    start_date: Annotated[Optional[str], Field(description="YYYY-MM-DD; defaults to the first submission")] = None,
    end_date: Annotated[Optional[str], Field(description="YYYY-MM-DD; defaults to today")] = None,
    timezone_name: Annotated[str, Field(description="IANA zone used for days/hours, e.g. 'Asia/Kolkata'")] = "UTC",
    granularity: Literal["auto", "day", "week", "month"] = "auto",
) -> dict:
    """Dashboard numbers for a form: total submissions and change vs the previous period, submissions
    over time, by weekday and hour, by country, and how people answered each choice/number field."""
    if form_slug:
        await _require_form(form_slug)
    data = await _analytics_call(compute_overview(
        _db(), form_slug or "", start_date or "", end_date or "", timezone_name, granularity,
    ))
    return {
        "form_slug": form_slug,
        "range": data["range"],
        "granularity": data["granularity"],
        "kpis": data["kpis"],
        "over_time": _series(data["timeseries"]),
        "by_weekday": _series(data["weekday"]),
        "by_hour": [p for p in _series(data["hour"]) if p[1]],
        "by_country": data["countries"],
        "field_breakdowns": [
            {"field": b["name"], "label": b["label"], "type": b["type"], "answers": b["values"],
             **({"stats": b["stats"]} if "stats" in b else {})}
            for b in data["breakdowns"]
        ],
        "truncated": data["truncated"],
    }


@mcp.tool(annotations=READ)
async def build_chart(
    form_slug: Optional[str] = None,
    group_by: Annotated[str, Field(description=(
        "X axis: 'day', 'week', 'month', 'weekday', 'hour', 'country', 'form', or a field name"
    ))] = "month",
    breakdown_fields: Annotated[Optional[list[str]], Field(description=(
        "Field names (or 'country') to split counts by their answers; several fields are compared side by side. "
        "Empty = just count submissions."
    ))] = None,
    metric: Annotated[Literal["count", "sum", "avg"], Field(description="sum/avg need number fields in breakdown_fields")] = "count",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    timezone_name: str = "UTC",
) -> dict:
    """Cross-tabulate submissions, e.g. ticket type per month, rating by weekday, average group size by
    country. Returns one series per answer (or per field for sum/avg) aligned with 'labels'."""
    if form_slug:
        await _require_form(form_slug)

    def dim(name: str) -> str:
        if name in ("country", "_country"):
            return "_country"
        if name in ("form", "_form"):
            return "_form"
        if name in ("day", "week", "month", "weekday", "hour"):
            return name
        return name if name.startswith("f:") else f"f:{name}"

    config = {
        "title": "chart",
        "type": "bar",
        "x": dim(group_by),
        "fields": [dim(f) for f in breakdown_fields or []],
        "metric": metric,
    }
    charts = await _analytics_call(compute_charts(
        _db(), form_slug or "", start_date or "", end_date or "", timezone_name, [config],
    ))
    chart = charts[0]
    if "error" in chart:
        raise ToolError(f"{chart['error']}. Use get_form to see valid field names.")
    series = []
    for ds in chart["datasets"]:
        name = ds.get("value") if ds.get("value") is not None else ds["label"]
        if ds.get("metric"):
            name = f"{ds['metric']} of {ds['label']}"
        elif chart["multi_field"] and not ds.get("other"):
            name = f"{ds['label']}: {name}"
        series.append({"name": name, "values": ds["data"]})
    return {"group_by": group_by, "labels": chart["labels"], "series": series}


# ---------- HTTP mounting ----------

MAX_FAILS = 10
FAIL_WINDOW = 15 * 60
_failed_auth: dict[str, list[float]] = defaultdict(list)


class _ApiKeyAuth:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        expected = settings.mcp_api_key
        if not expected:
            response = JSONResponse({"error": "MCP server is disabled. Set MCP_API_KEY to enable it."}, status_code=503)
            return await response(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        ip = scope["client"][0] if scope.get("client") else "unknown"
        if os.environ.get("RAILWAY_ENVIRONMENT"):
            ip = (headers.get("x-real-ip") or headers.get("x-forwarded-for", "").split(",")[0]).strip() or ip
        now = time.time()
        fails = [t for t in _failed_auth[ip] if t > now - FAIL_WINDOW]
        _failed_auth[ip] = fails
        if len(fails) >= MAX_FAILS:
            response = JSONResponse(
                {"error": "Too many failed attempts"}, status_code=429,
                headers={"Retry-After": str(FAIL_WINDOW)},
            )
            return await response(scope, receive, send)
        auth = headers.get("authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else headers.get("x-api-key", "")
        if not hmac.compare_digest(token.encode(), expected.encode()):
            fails.append(now)
            response = JSONResponse(
                {"error": "Invalid or missing API key"}, status_code=401,
                headers={"WWW-Authenticate": 'Bearer realm="mcp"'},
            )
            return await response(scope, receive, send)
        return await self.app(scope, receive, send)


def build_route(path: str = "/mcp") -> Route:
    starlette_app = mcp.streamable_http_app(
        streamable_http_path=path,
        stateless_http=True,
        json_response=True,
        # Host-header checks guard local servers against DNS rebinding; this one is
        # public and gated by an API key, so it must accept the deployed hostname.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    inner = next(r for r in starlette_app.routes if getattr(r, "path", None) == path)
    return Route(path, endpoint=_ApiKeyAuth(inner.endpoint))
