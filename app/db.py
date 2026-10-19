import json
from typing import Optional

import asyncpg
from app.config import settings


async def init_conn(conn: asyncpg.Connection):
    """Initialize connection with JSONB codec for proper Python dict/list handling."""
    await conn.set_type_codec(
        'jsonb',
        encoder=lambda x: json.dumps(x) if not isinstance(x, str) else x,
        decoder=json.loads,
        schema='pg_catalog',
    )


async def create_pool() -> Optional[asyncpg.Pool]:
    if not settings.database_url:
        return None
    return await asyncpg.create_pool(
        settings.database_url,
        init=init_conn,
        min_size=2,
        max_size=10,
    )


async def init_db(pool: Optional[asyncpg.Pool]):
    if not pool:
        return
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS forms (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(100) UNIQUE NOT NULL,
                title VARCHAR(255) NOT NULL DEFAULT 'Contact Form',
                fields JSONB NOT NULL DEFAULT '[]',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            ALTER TABLE forms ADD COLUMN IF NOT EXISTS cap_site_key VARCHAR(255) DEFAULT NULL;
        """)
        await conn.execute("""
            ALTER TABLE forms ADD COLUMN IF NOT EXISTS cap_site_secret VARCHAR(255) DEFAULT NULL;
        """)
        await conn.execute("""
            ALTER TABLE forms ADD COLUMN IF NOT EXISTS post_submit_message TEXT DEFAULT '';
        """)
        await conn.execute("""
            ALTER TABLE forms ADD COLUMN IF NOT EXISTS redirect_url VARCHAR(500) DEFAULT '';
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS submissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                form_slug VARCHAR(100) NOT NULL REFERENCES forms(slug),
                data JSONB NOT NULL,
                metadata JSONB NOT NULL DEFAULT '{}',
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_submissions_form_slug ON submissions(form_slug);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_submissions_is_read ON submissions(is_read);
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS analytics_charts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                form_slug VARCHAR(100) NOT NULL DEFAULT '',
                config JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_analytics_charts_form_slug ON analytics_charts(form_slug);
        """)

        existing = await conn.fetchrow("SELECT id FROM forms WHERE slug = 'contact'")
        if not existing:
            default_fields = [
                {"name": "name", "type": "text", "required": True, "label": "Your Name"},
                {"name": "email", "type": "email", "required": True, "label": "Your Email"},
                {"name": "message", "type": "textarea", "required": True, "label": "Message"},
            ]
            await conn.execute(
                "INSERT INTO forms (slug, title, fields) VALUES ($1, $2, $3)",
                "contact", "Contact Form", json.dumps(default_fields),
            )
