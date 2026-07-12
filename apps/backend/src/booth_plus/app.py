from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .database import Database
from .rate_limit import RateLimitMiddleware


class ReadinessDatabase(Protocol):
    async def is_ready(self) -> bool: ...


def create_app(
    settings: Settings | None = None, database: ReadinessDatabase | None = None
) -> FastAPI:
    settings = settings or load_settings()
    managed_database = database is None
    database = database or Database(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if managed_database:
            await database.open()  # type: ignore[attr-defined]
        yield
        if managed_database:
            await database.close()  # type: ignore[attr-defined]

    app = FastAPI(
        title="BoothPlus API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin for origin in settings.cors_origins if "*" not in origin],
        allow_origin_regex=r"https://([a-z0-9-]+\.)*booth\.pm"
        if "https://*.booth.pm" in settings.cors_origins
        else None,
        allow_credentials=True,
        allow_methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=86400,
    )
    app.add_middleware(
        RateLimitMiddleware,
        window_ms=settings.rate_limit_window_ms,
        maximum=settings.rate_limit_max_requests,
        write_maximum=settings.rate_limit_write_max_requests,
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "booth-plus-backend", "runtime": "python"}

    @app.get("/api/health/storage")
    async def storage_health() -> JSONResponse:
        try:
            ready = await database.is_ready()
        except Exception:
            ready = False
        return JSONResponse(
            {
                "status": "ok" if ready else "unavailable",
                "service": "booth-plus-backend",
                "storage": "postgresql",
            },
            status_code=200 if ready else 503,
        )

    @app.exception_handler(404)
    async def not_found(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            {"statusCode": 404, "error": "Not Found", "message": "Not Found"}, status_code=404
        )

    return app
