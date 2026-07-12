from dataclasses import replace

from httpx import ASGITransport, AsyncClient

from booth_plus.app import create_app
from booth_plus.config import load_settings


class FakeDatabase:
    def __init__(self, ready: bool = True) -> None:
        self.ready = ready

    async def is_ready(self) -> bool:
        return self.ready


def settings():
    return load_settings(
        {
            "DATABASE_URL": "postgresql://user:password@localhost/db",
            "DATABASE_SSL_MODE": "disable",
            "CORS_ORIGINS": "http://localhost:3000",
        }
    )


async def test_health() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(settings(), FakeDatabase())), base_url="http://test"
    ) as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["runtime"] == "python"


async def test_storage_unavailable() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(settings(), FakeDatabase(False))),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/health/storage")
    assert response.status_code == 503


async def test_api_documentation_is_not_exposed() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(settings(), FakeDatabase())),
        base_url="http://test",
    ) as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert (await client.get(path)).status_code == 404


async def test_rate_limit() -> None:
    limited = replace(settings(), rate_limit_max_requests=1)
    async with AsyncClient(
        transport=ASGITransport(app=create_app(limited, FakeDatabase())), base_url="http://test"
    ) as client:
        assert (await client.get("/api/missing")).status_code == 404
        response = await client.get("/api/missing")
    assert response.status_code == 429
    assert "Retry-After" in response.headers
