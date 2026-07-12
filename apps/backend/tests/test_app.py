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
        ("POST", "/api/auth/logout"),
        ("GET", "/api/user/me"),
        ("PUT", "/api/user/autoCollapse"),
        ("PUT", "/api/user/hideAvatar"),
        ("PUT", "/api/user/username"),
        ("PUT", "/api/user/bio"),
        ("GET", "/api/user/avatar/{user_id}"),
        ("GET", "/api/comment"),
        ("GET", "/api/comment/my"),
        ("POST", "/api/comment/{product_id}"),
        ("PUT", "/api/comment/{comment_id}"),
        ("DELETE", "/api/comment/{comment_id}"),
        ("POST", "/api/comment/{comment_id}/upvote"),
        ("POST", "/api/comment/{comment_id}/downvote"),
        ("GET", "/api/admin/comments"),
        ("PUT", "/api/admin/comments/{comment_id}/disabled"),
        ("DELETE", "/api/admin/comments/{comment_id}"),
        ("POST", "/api/admin/imports/comments"),
    }
    assert expected <= registered
    assert ("GET", "/api/product/search") not in registered
    assert ("GET", "/api/product/{product_id}") not in registered


async def test_protected_route_requires_authentication() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(settings(), FakeDatabase())),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/user/me")
    assert response.status_code == 401, response.text
    assert response.json()["message"] == "authentication required"

    async with AsyncClient(
        transport=ASGITransport(app=create_app(settings(), FakeDatabase())),
        base_url="http://test",
    ) as client:
        admin_response = await client.get("/api/admin/comments")
    assert admin_response.status_code == 401, admin_response.text


async def test_discord_login_uses_legacy_desktop_handoff_url() -> None:
    configured = replace(settings(), discord_client_id="123456789")
    redirect_url = "https://hafbafjoecfjdlhjilpakabocglkaegj.chromiumapp.org/"
    async with AsyncClient(
        transport=ASGITransport(app=create_app(configured, FakeDatabase())),
        base_url="http://test",
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/api/auth/oauth/discord",
            params={"redirectUrl": redirect_url, "state": "a" * 32},
        )

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        "https://discord.com/api/oauth2/authorize?"
    )
    assert "state=" + "a" * 32 in response.headers["location"]


async def test_discord_login_accepts_only_configured_admin_callback() -> None:
    configured = replace(
        settings(),
        discord_client_id="123456789",
        admin_redirect_url="https://example.com/admin/oauth/callback",
    )
    async with AsyncClient(
        transport=ASGITransport(app=create_app(configured, FakeDatabase())),
        base_url="http://test",
        follow_redirects=False,
    ) as client:
        accepted = await client.get(
            "/api/auth/oauth/discord",
            params={
                "redirectUrl": configured.admin_redirect_url,
                "state": "a" * 32,
            },
        )
        rejected = await client.get(
            "/api/auth/oauth/discord",
            params={
                "redirectUrl": "https://attacker.example/oauth/callback",
                "state": "a" * 32,
            },
        )

    assert accepted.status_code == 302
    assert rejected.status_code == 400
