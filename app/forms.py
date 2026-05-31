import json
import logging
from typing import Optional
import asyncpg

logger = logging.getLogger(__name__)


def _parse_form(row):
    """Parse a form row, ensuring 'fields' is a Python list, not a JSON string."""
    if row is not None:
        d = dict(row)
        if isinstance(d.get("fields"), str):
            d["fields"] = json.loads(d["fields"])
        return d
    return None


async def get_forms(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM forms ORDER BY created_at DESC")
        return [_parse_form(r) for r in rows]


async def get_form(pool: asyncpg.Pool, form_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM forms WHERE id = $1", form_id)
        return _parse_form(row)


async def get_form_by_slug(pool: asyncpg.Pool, slug: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM forms WHERE slug = $1", slug)
        return _parse_form(row)


async def create_form(pool: asyncpg.Pool, slug: str, title: str, fields: list):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO forms (slug, title, fields) VALUES ($1, $2, $3) RETURNING *",
            slug, title, json.dumps(fields),
        )
        result = _parse_form(row)

    from app.cap_site_key import auto_provision
    await auto_provision(pool, slug)

    return result


async def update_form(pool: asyncpg.Pool, form_id: str, title: str, fields: list):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE forms SET title = $1, fields = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
            title, json.dumps(fields), form_id,
        )
        return _parse_form(row)


async def delete_form(pool: asyncpg.Pool, form_id: str) -> bool:
    async with pool.acquire() as conn:
        slug = await conn.fetchval("SELECT slug FROM forms WHERE id = $1", form_id)
        if not slug:
            return False
        sub_count = await conn.fetchval(
            "SELECT COUNT(*) FROM submissions WHERE form_slug = $1", slug
        )
        if sub_count is not None and sub_count > 0:
            await conn.execute("DELETE FROM submissions WHERE form_slug = $1", slug)
        result = await conn.execute("DELETE FROM forms WHERE id = $1", form_id)
        return True
