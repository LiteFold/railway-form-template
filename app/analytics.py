import math
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from statistics import median
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from app.admin import auth_required, require_pool
from app.forms import get_forms
from app.templates_ import TemplateResponse

router = APIRouter()

MAX_ROWS = 200_000
TOP_SERIES = 8
TOP_CATEGORIES = 15
MAX_SERIES_FIELDS = 5
MAX_BREAKDOWN_VALUES = 12
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TIME_DIMS = ("day", "week", "month")
CYCLIC_DIMS = ("weekday", "hour")
CHART_TYPES = {"stacked", "bar", "line", "area", "hbar", "doughnut"}
METRICS = {"count", "sum", "avg"}
FREE_TEXT_TYPES = {"textarea", "email", "url", "tel"}


# ---------- request helpers ----------

def _require_json_auth(request: Request):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401, detail="Not authenticated")


def _pool(request: Request):
    pool = request.app.state.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return pool


def _tz(name: str):
    try:
        return ZoneInfo(name)
    except Exception:
        return timezone.utc


def _parse_date(value: str):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}")


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON body must be an object")
    return body


async def _load_form(pool, slug: str):
    forms = await get_forms(pool)
    if not slug:
        return None
    form_def = next((f for f in forms if f["slug"] == slug), None)
    if form_def is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return form_def


def _fields_meta(form_def) -> list[dict]:
    if not form_def:
        return []
    meta = []
    for f in form_def.get("fields") or []:
        name = f.get("name")
        if not name:
            continue
        meta.append({
            "key": f"f:{name}",
            "name": name,
            "label": f.get("label") or name,
            "type": f.get("type") or "text",
        })
    return meta


def _dimension_labels(fields_meta) -> dict:
    labels = {"_country": "Country", "_form": "Form"}
    labels.update({m["key"]: m["label"] for m in fields_meta})
    return labels


# ---------- data loading ----------

async def _resolve_range(conn, form: str, start_s: str, end_s: str, tz):
    today = datetime.now(tz).date()
    end = _parse_date(end_s) or today
    start = _parse_date(start_s)
    if start is None:
        if form:
            first = await conn.fetchval("SELECT MIN(created_at) FROM submissions WHERE form_slug = $1", form)
        else:
            first = await conn.fetchval("SELECT MIN(created_at) FROM submissions")
        start = first.astimezone(tz).date() if first else end - timedelta(days=29)
    if start > end:
        start, end = end, start
    if (end - start).days > 3660:
        start = end - timedelta(days=3660)
    return start, end


def _utc_bounds(start: date, end: date, tz):
    return (
        datetime.combine(start, time.min, tzinfo=tz),
        datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz),
    )


async def _fetch_rows(conn, form: str, s: datetime, e: datetime, tz) -> list[dict]:
    params = [s, e]
    where = "created_at >= $1 AND created_at < $2"
    if form:
        where += " AND form_slug = $3"
        params.append(form)
    records = await conn.fetch(
        f"SELECT form_slug, data, metadata, created_at FROM submissions WHERE {where} "
        f"ORDER BY created_at LIMIT {MAX_ROWS}",
        *params,
    )
    rows = []
    for r in records:
        data = r["data"] if isinstance(r["data"], dict) else {}
        meta = r["metadata"] if isinstance(r["metadata"], dict) else {}
        country = meta.get("country")
        rows.append({
            "form": r["form_slug"],
            "data": data,
            "country": country.upper() if isinstance(country, str) and len(country) == 2 else None,
            "t": r["created_at"].astimezone(tz),
        })
    return rows


async def _count(conn, form: str, s: datetime, e: datetime) -> int:
    if form:
        return await conn.fetchval(
            "SELECT COUNT(*) FROM submissions WHERE created_at >= $1 AND created_at < $2 AND form_slug = $3",
            s, e, form,
        ) or 0
    return await conn.fetchval(
        "SELECT COUNT(*) FROM submissions WHERE created_at >= $1 AND created_at < $2", s, e,
    ) or 0


# ---------- value extraction ----------

def _norm(value) -> str:
    if value is None:
        return "(empty)"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    if not text:
        return "(empty)"
    return text[:80]


def _values(row: dict, key: str, ftypes: dict) -> list[str]:
    if key == "_country":
        return [row["country"] or "Unknown"]
    if key == "_form":
        return [row["form"]]
    name = key[2:]
    raw = row["data"].get(name)
    if ftypes.get(key) == "checkbox":
        return ["Yes" if raw not in (None, "", False) else "No"]
    if isinstance(raw, list):
        return [_norm(v) for v in raw] or ["(empty)"]
    return [_norm(raw)]


def _number(row: dict, key: str):
    try:
        num = float(row["data"].get(key[2:]))
    except (TypeError, ValueError):
        return None
    return num if math.isfinite(num) else None


# ---------- axes ----------

def _time_buckets(start: date, end: date, gran: str) -> list[date]:
    if gran == "week":
        d = start - timedelta(days=start.weekday())
    elif gran == "month":
        d = start.replace(day=1)
    else:
        d = start
    out = []
    while d <= end:
        out.append(d)
        if gran == "day":
            d += timedelta(days=1)
        elif gran == "week":
            d += timedelta(days=7)
        else:
            d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return out


def _time_label(d: date, gran: str, multi_year: bool) -> str:
    if gran == "month":
        return d.strftime("%b %Y")
    label = f"{d.strftime('%b')} {d.day}"
    if multi_year:
        label += f" '{d.strftime('%y')}"
    return label


def _row_x(row: dict, x: str, ftypes: dict) -> list:
    t = row["t"]
    if x == "day":
        return [t.date()]
    if x == "week":
        d = t.date()
        return [d - timedelta(days=d.weekday())]
    if x == "month":
        return [t.date().replace(day=1)]
    if x == "weekday":
        return [t.weekday()]
    if x == "hour":
        return [t.hour]
    return _values(row, x, ftypes)


def _axis(rows, x: str, start: date, end: date, ftypes: dict):
    """Return (keys, labels, category_set). category_set is None for fixed axes."""
    if x in TIME_DIMS:
        keys = _time_buckets(start, end, x)
        multi_year = start.year != end.year
        return keys, [_time_label(k, x, multi_year) for k in keys], None
    if x == "weekday":
        return list(range(7)), list(WEEKDAYS), None
    if x == "hour":
        return list(range(24)), [f"{h:02d}:00" for h in range(24)], None
    counts = Counter()
    for r in rows:
        for v in _values(r, x, ftypes):
            counts[v] += 1
    top = [k for k, _ in counts.most_common(TOP_CATEGORIES)]
    keys = top + (["Other"] if len(counts) > len(top) else [])
    return keys, list(keys), set(top)


def build_chart(rows, cfg: dict, start: date, end: date, ftypes: dict, flabels: dict) -> dict:
    x, fields, metric = cfg["x"], cfg["fields"], cfg["metric"]
    keys, labels, categories = _axis(rows, x, start, end, ftypes)
    index = {k: i for i, k in enumerate(keys)}
    n = len(keys)

    def positions(row):
        out = []
        for k in _row_x(row, x, ftypes):
            if categories is not None and k not in categories:
                k = "Other"
            i = index.get(k)
            if i is not None:
                out.append(i)
        return out

    datasets = []
    if metric in ("sum", "avg"):
        for f in fields:
            sums, counts = [0.0] * n, [0] * n
            for r in rows:
                v = _number(r, f)
                if v is None:
                    continue
                for i in positions(r):
                    sums[i] += v
                    counts[i] += 1
            if metric == "sum":
                data = [round(s, 2) for s in sums]
            else:
                data = [round(sums[i] / counts[i], 2) if counts[i] else None for i in range(n)]
            datasets.append({"field": f, "metric": metric, "label": flabels.get(f, f), "data": data})
    elif not fields:
        data = [0] * n
        for r in rows:
            for i in positions(r):
                data[i] += 1
        datasets.append({"field": None, "label": "Submissions", "data": data})
    else:
        totals = Counter()
        grid = defaultdict(lambda: [0] * n)
        for r in rows:
            pos = positions(r)
            if not pos:
                continue
            for f in fields:
                for v in _values(r, f, ftypes):
                    series = (f, v)
                    totals[series] += 1
                    arr = grid[series]
                    for i in pos:
                        arr[i] += 1
        top = [s for s, _ in totals.most_common(TOP_SERIES)]
        for f, v in top:
            datasets.append({"field": f, "value": v, "label": flabels.get(f, f), "data": grid[(f, v)]})
        top_set = set(top)
        rest = [arr for s, arr in grid.items() if s not in top_set]
        if rest:
            datasets.append({"field": None, "value": "Other", "label": "Other", "other": True,
                             "data": [sum(col) for col in zip(*rest)]})

    return {
        "labels": labels,
        "x": x,
        "multi_field": len(fields) > 1,
        "datasets": datasets,
    }


# ---------- field breakdowns ----------

def _number_breakdown(rows, meta) -> dict | None:
    nums = [v for v in (_number(r, meta["key"]) for r in rows) if v is not None]
    if not nums:
        return None
    lo, hi = min(nums), max(nums)
    distinct = sorted(set(nums))
    if len(distinct) <= 10:
        counts = Counter(nums)
        values = [[_norm(v), counts[v]] for v in distinct]
    elif all(v.is_integer() for v in nums):
        width = math.ceil((hi - lo + 1) / 8)
        bins = math.ceil((hi - lo + 1) / width)
        counts = [0] * bins
        for v in nums:
            counts[int((v - lo) // width)] += 1
        values = []
        for i in range(bins):
            a, b = int(lo + i * width), int(lo + (i + 1) * width - 1)
            values.append([str(a) if a == b else f"{a}–{b}", counts[i]])
    else:
        bins = 8
        width = (hi - lo) / bins or 1
        counts = [0] * bins
        for v in nums:
            counts[min(int((v - lo) / width), bins - 1)] += 1
        values = [
            [f"{_norm(round(lo + i * width, 1))}–{_norm(round(lo + (i + 1) * width, 1))}", counts[i]]
            for i in range(bins)
        ]
    return {
        **meta,
        "kind": "number",
        "values": values,
        "stats": {
            "count": len(nums),
            "min": round(lo, 2),
            "max": round(hi, 2),
            "avg": round(sum(nums) / len(nums), 2),
            "median": round(median(nums), 2),
        },
    }


def _breakdowns(rows, fields_meta, ftypes) -> list[dict]:
    out = []
    for meta in fields_meta:
        if meta["type"] in FREE_TEXT_TYPES:
            continue
        if meta["type"] == "number":
            item = _number_breakdown(rows, meta)
            if item:
                out.append(item)
            continue
        counts = Counter(v for r in rows for v in _values(r, meta["key"], ftypes))
        counts.pop("(empty)", None)
        if not counts:
            continue
        if meta["type"] == "text" and len(counts) > MAX_BREAKDOWN_VALUES:
            continue
        top = counts.most_common(MAX_BREAKDOWN_VALUES)
        other = sum(counts.values()) - sum(c for _, c in top)
        values = [[v, c] for v, c in top] + ([["Other", other]] if other else [])
        out.append({**meta, "kind": "category", "values": values})
    return out


# ---------- chart config validation ----------

def _validate_config(cfg, fields_meta, all_forms: bool) -> dict:
    if not isinstance(cfg, dict):
        raise HTTPException(status_code=400, detail="config must be an object")
    ftypes = {m["key"]: m["type"] for m in fields_meta}
    dims = {"_country"} | set(ftypes) | ({"_form"} if all_forms else set())

    chart_type = cfg.get("type", "stacked")
    if chart_type not in CHART_TYPES:
        raise HTTPException(status_code=400, detail="Invalid chart type")

    x = cfg.get("x", "month")
    if x not in TIME_DIMS and x not in CYCLIC_DIMS and x not in dims:
        raise HTTPException(status_code=400, detail="Invalid x dimension")

    fields = cfg.get("fields") or []
    if not isinstance(fields, list) or any(not isinstance(f, str) or f not in dims for f in fields):
        raise HTTPException(status_code=400, detail="Invalid series fields")
    fields = list(dict.fromkeys(fields))[:MAX_SERIES_FIELDS]

    metric = cfg.get("metric", "count")
    if metric not in METRICS:
        raise HTTPException(status_code=400, detail="Invalid metric")
    if metric != "count":
        if not fields or any(ftypes.get(f) != "number" for f in fields):
            raise HTTPException(status_code=400, detail="Sum/average need number fields")

    if chart_type == "doughnut":
        if x in TIME_DIMS:
            raise HTTPException(status_code=400, detail="Doughnut charts need a category, weekday or hour axis")
        fields, metric = [], "count"

    title = str(cfg.get("title") or "").strip()[:100] or "Untitled chart"
    return {"title": title, "type": chart_type, "x": x, "fields": fields, "metric": metric}


# ---------- routes ----------

@router.get("", response_class=HTMLResponse)
async def analytics_page(request: Request):
    auth_required(request)
    pool = request.app.state.pool
    if pool is None:
        return await require_pool(request)
    forms = await get_forms(pool)
    return await TemplateResponse(
        "admin_dashboard.html",
        {"request": request, "forms": forms, "show_analytics": True},
    )


@router.get("/data")
async def analytics_data(
    request: Request,
    form: str = Query(""),
    start: str = Query(""),
    end: str = Query(""),
    tz: str = Query("UTC"),
    granularity: str = Query("auto"),
    map_field: str = Query("_country"),
):
    _require_json_auth(request)
    pool = _pool(request)
    tzinfo = _tz(tz)
    form_def = await _load_form(pool, form)
    fields_meta = _fields_meta(form_def)
    ftypes = {m["key"]: m["type"] for m in fields_meta}
    flabels = _dimension_labels(fields_meta)
    if map_field != "_country" and map_field not in ftypes:
        map_field = "_country"

    async with pool.acquire() as conn:
        start_d, end_d = await _resolve_range(conn, form, start, end, tzinfo)
        s, e = _utc_bounds(start_d, end_d, tzinfo)
        rows = await _fetch_rows(conn, form, s, e, tzinfo)
        span = (end_d - start_d).days + 1
        prev_total = await _count(conn, form, s - timedelta(days=span), s)

    if granularity not in TIME_DIMS:
        granularity = "day" if span <= 62 else "week" if span <= 210 else "month"

    count_cfg = {"fields": [], "metric": "count"}
    timeseries = build_chart(rows, {**count_cfg, "x": granularity}, start_d, end_d, ftypes, flabels)
    weekday = build_chart(rows, {**count_cfg, "x": "weekday"}, start_d, end_d, ftypes, flabels)
    hour = build_chart(rows, {**count_cfg, "x": "hour"}, start_d, end_d, ftypes, flabels)

    total = len(rows)
    countries = Counter(r["country"] for r in rows if r["country"])
    if map_field == "_country":
        map_values = dict(countries)
        map_unknown = total - sum(countries.values())
    else:
        map_values = dict(Counter(v for r in rows for v in _values(r, map_field, ftypes) if v != "(empty)"))
        map_unknown = 0

    weekday_counts = weekday["datasets"][0]["data"]
    busiest = WEEKDAYS[weekday_counts.index(max(weekday_counts))] if total else None
    change = None
    if prev_total:
        change = round((total - prev_total) / prev_total * 100, 1)

    return {
        "form": form,
        "range": {"start": start_d.isoformat(), "end": end_d.isoformat(), "days": span},
        "granularity": granularity,
        "truncated": total >= MAX_ROWS,
        "kpis": {
            "total": total,
            "previous_total": prev_total,
            "change_pct": change,
            "daily_avg": round(total / span, 1) if span else 0,
            "countries": len(countries),
            "top_country": countries.most_common(1)[0][0] if countries else None,
            "busiest_weekday": busiest,
        },
        "timeseries": timeseries,
        "weekday": weekday,
        "hour": hour,
        "map": {"field": map_field, "values": map_values, "unknown": map_unknown},
        "countries": [[c, n] for c, n in countries.most_common()],
        "fields": fields_meta,
        "breakdowns": _breakdowns(rows, fields_meta, ftypes),
    }


@router.post("/chart-data")
async def chart_data(request: Request):
    _require_json_auth(request)
    pool = _pool(request)
    body = await _json_body(request)
    form = str(body.get("form") or "")
    configs = body.get("configs")
    if not isinstance(configs, list) or not configs or len(configs) > 50:
        raise HTTPException(status_code=400, detail="configs must be a non-empty list (max 50)")
    tzinfo = _tz(str(body.get("tz") or "UTC"))
    form_def = await _load_form(pool, form)
    fields_meta = _fields_meta(form_def)
    ftypes = {m["key"]: m["type"] for m in fields_meta}
    flabels = _dimension_labels(fields_meta)
    validated = []
    for c in configs:
        try:
            validated.append((_validate_config(c, fields_meta, not form), None))
        except HTTPException as exc:
            validated.append((None, exc.detail))

    async with pool.acquire() as conn:
        start_d, end_d = await _resolve_range(conn, form, str(body.get("start") or ""), str(body.get("end") or ""), tzinfo)
        s, e = _utc_bounds(start_d, end_d, tzinfo)
        rows = await _fetch_rows(conn, form, s, e, tzinfo)

    return {
        "charts": [
            {"error": err} if cfg is None
            else {"config": cfg, **build_chart(rows, cfg, start_d, end_d, ftypes, flabels)}
            for cfg, err in validated
        ]
    }


@router.get("/charts")
async def list_charts(request: Request, form: str = Query("")):
    _require_json_auth(request)
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, config FROM analytics_charts WHERE form_slug = $1 ORDER BY created_at",
            form,
        )
    return {"charts": [{"id": str(r["id"]), "config": r["config"]} for r in rows]}


@router.post("/charts")
async def create_chart(request: Request):
    _require_json_auth(request)
    pool = _pool(request)
    body = await _json_body(request)
    form = str(body.get("form") or "")
    form_def = await _load_form(pool, form)
    cfg = _validate_config(body.get("config"), _fields_meta(form_def), not form)
    async with pool.acquire() as conn:
        chart_id = await conn.fetchval(
            "INSERT INTO analytics_charts (form_slug, config) VALUES ($1, $2) RETURNING id",
            form, cfg,
        )
    return {"id": str(chart_id), "config": cfg}


def _chart_uuid(chart_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(chart_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Chart not found")


@router.put("/charts/{chart_id}")
async def update_chart(request: Request, chart_id: str):
    _require_json_auth(request)
    pool = _pool(request)
    cid = _chart_uuid(chart_id)
    body = await _json_body(request)
    async with pool.acquire() as conn:
        form = await conn.fetchval("SELECT form_slug FROM analytics_charts WHERE id = $1", cid)
    if form is None:
        raise HTTPException(status_code=404, detail="Chart not found")
    form_def = await _load_form(pool, form)
    cfg = _validate_config(body.get("config"), _fields_meta(form_def), not form)
    async with pool.acquire() as conn:
        await conn.execute("UPDATE analytics_charts SET config = $1 WHERE id = $2", cfg, cid)
    return {"id": chart_id, "config": cfg}


@router.delete("/charts/{chart_id}")
async def delete_chart(request: Request, chart_id: str):
    _require_json_auth(request)
    pool = _pool(request)
    cid = _chart_uuid(chart_id)
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM analytics_charts WHERE id = $1", cid)
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="Chart not found")
    return {"ok": True}
