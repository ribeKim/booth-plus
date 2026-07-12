from __future__ import annotations

from math import ceil
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .config import Settings

READINESS_QUERY = """
SELECT NOT pg_is_in_recovery()
  AND current_setting('transaction_read_only') = 'off'
  AND EXISTS (SELECT 1 FROM public.alembic_version)
  AND to_regclass('public.users') IS NOT NULL
  AND to_regclass('public.oauth_accounts') IS NOT NULL
  AND to_regclass('public.auth_sessions') IS NOT NULL
  AND to_regclass('public.admin_discord_ids') IS NOT NULL
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


def sqlalchemy_url(database_url: str) -> URL:
    url = make_url(database_url)
    return url.set(drivername="postgresql+psycopg")


def alembic_config_url(database_url: str) -> str:
    # Alembic stores options in ConfigParser, where percent signs introduce
    # interpolation. Doubling them preserves URL-encoded credentials.
    return sqlalchemy_url(database_url).render_as_string(hide_password=False).replace("%", "%%")


class Database:
    def __init__(self, settings: Settings) -> None:
        self.engine: AsyncEngine = create_async_engine(
            sqlalchemy_url(settings.database_url),
            connect_args=connection_kwargs(settings),
            pool_size=settings.database_pool_max,
            max_overflow=0,
            pool_pre_ping=True,
            pool_recycle=settings.database_max_lifetime_seconds,
        )

    async def open(self) -> None:
        async with self.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))

    async def close(self) -> None:
        await self.engine.dispose()

    async def is_ready(self) -> bool:
        async with self.engine.connect() as connection:
            result = await connection.scalar(text(READINESS_QUERY))
        return result is True
