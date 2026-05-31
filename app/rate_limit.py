import time
from collections import defaultdict
from typing import Optional

import asyncpg

from app.config import settings

_memory_store: dict[str, list[float]] = defaultdict(list)


async def check_rate_limit_memory(ip: str, prefix: str = "ratelimit:") -> bool:
    now = time.time()
    window = 3600
    max_requests = settings.rate_limit

    key = prefix + ip
    timestamps = _memory_store[key]
    cutoff = now - window
    timestamps[:] = [t for t in timestamps if t > cutoff]

    if len(timestamps) >= max_requests:
        return False

    timestamps.append(now)
    return True


async def ensure_rate_limit_table(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                ip VARCHAR(45) NOT NULL,
                window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                count INT NOT NULL DEFAULT 1,
                PRIMARY KEY (ip, window_start)
            );
        """)


async def check_rate_limit_db(pool: asyncpg.Pool, ip: str, prefix: str = "ratelimit:") -> bool:
    max_requests = settings.rate_limit
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT count FROM rate_limits WHERE ip = $1 "
            "AND window_start > NOW() - INTERVAL '1 hour' "
            "ORDER BY window_start DESC LIMIT 1",
            prefix + ip,
        )
        if row and row["count"] >= max_requests:
            return False

        await conn.execute(
            "INSERT INTO rate_limits (ip, window_start, count) VALUES ($1, NOW(), 1) "
            "ON CONFLICT (ip, window_start) DO UPDATE SET count = rate_limits.count + 1",
            prefix + ip,
        )
        return True


async def check_rate_limit(pool: Optional[asyncpg.Pool], ip: str, prefix: str = "ratelimit:") -> bool:
    if settings.rate_limit_backend == "db" and pool:
        return await check_rate_limit_db(pool, ip, prefix)
    return await check_rate_limit_memory(ip, prefix)
