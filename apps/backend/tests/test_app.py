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


async def test_frontend_api_routes_are_registered() -> None:
    app = create_app(settings(), FakeDatabase())
    registered = {(method, route.path) for route in app.routes for method in route.methods or []}
    expected = {
        ("GET", "/api/auth/oauth/discord"),
        ("GET", "/api/auth/oauth/discord/callback"),
        ("POST", "/api/auth/token"),
        ("GET", "/api/user/me"),
        ("PUT", "/api/user/adult"),
        ("PUT", "/api/user/autoCollapse"),
        ("PUT", "/api/user/hideAvatar"),
        ("PUT", "/api/user/username"),
        ("PUT", "/api/user/bio"),
        ("GET", "/api/user/avatar/{user_id}"),
        ("GET", "/api/product/search"),
        ("GET", "/api/product/{product_id}"),
        ("GET", "/api/comment"),
        ("GET", "/api/comment/my"),
        ("GET", "/api/comment/{product_id}/my"),
        ("POST", "/api/comment/{product_id}"),
        ("PUT", "/api/comment/{product_id}"),
        ("DELETE", "/api/comment/{product_id}"),
        ("POST", "/api/comment/{comment_id}/upvote"),
        ("POST", "/api/comment/{comment_id}/downvote"),
    }
    assert expected <= registered


async def test_protected_route_requires_authentication() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(settings(), FakeDatabase())),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/user/me")
    assert response.status_code == 401, response.text
    assert response.json()["message"] == "authentication required"


async def test_discord_login_uses_legacy_desktop_handoff_url() -> None:
    configured = replace(settings(), discord_client_id="123456789")
    redirect_url = "https://hafbafjoecfjdlhjilpakabocglkaegj.chromiumapp.org/"
    async with AsyncClient(
        transport=ASGITransport(app=create_app(configured, FakeDatabase())),
        base_url="http://test",
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/api/auth/oauth/discord", params={"redirectUrl": redirect_url}
        )

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        "https://discord.com/api/oauth2/authorize?"
    )
