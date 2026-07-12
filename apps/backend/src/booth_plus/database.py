from __future__ import annotations

from math import ceil
from typing import Any

from psycopg_pool import AsyncConnectionPool

from .config import Settings

READINESS_QUERY = """
SELECT NOT pg_is_in_recovery()
  AND current_setting('transaction_read_only') = 'off'
  AND EXISTS (SELECT 1 FROM public.app_migrations WHERE name = '0001_initial')
  AND to_regclass('public.users') IS NOT NULL
  AND to_regclass('public.oauth_accounts') IS NOT NULL
  AND to_regclass('public.auth_sessions') IS NOT NULL
  AND to_regclass('public.shops') IS NOT NULL
  AND to_regclass('public.products') IS NOT NULL
  AND to_regclass('public.product_thumbnails') IS NOT NULL
  AND to_regclass('public.comments') IS NOT NULL
  AND to_regclass('public.comment_votes') IS NOT NULL AS is_ready
"""


def connection_kwargs(settings: Settings) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "connect_timeout": ceil(settings.database_connect_timeout_ms / 1000),
        "application_name": "booth-plus-backend",
        "options": f"-c statement_timeout={settings.database_statement_timeout_ms}",
    }
    if settings.database_ssl_mode == "disable":
        kwargs["sslmode"] = "disable"
    elif settings.database_ssl_mode == "require":
        kwargs["sslmode"] = "require"
    else:
        kwargs.update(sslmode="verify-full", sslrootcert=settings.database_ssl_ca_file)
    return kwargs


class Database:
    def __init__(self, settings: Settings) -> None:
        self.pool = AsyncConnectionPool(
            settings.database_url,
            kwargs=connection_kwargs(settings),
            min_size=0,
            max_size=settings.database_pool_max,
            open=False,
        )

    async def open(self) -> None:
        await self.pool.open(wait=True)

    async def close(self) -> None:
        await self.pool.close()

    async def is_ready(self) -> bool:
        async with self.pool.connection() as connection, connection.cursor() as cursor:
            await cursor.execute(READINESS_QUERY)
            row = await cursor.fetchone()
        return bool(row and row[0])
