import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Protocol, cast
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from .auth import issue_access_token, new_refresh_token, token_hash, verify_access_token
from .booth import BoothProduct, fetch_product
from .config import Settings


class ApiDatabase(Protocol):
    engine: AsyncEngine


class RefreshBody(BaseModel):
    refresh_token: str = Field(alias="refreshToken", min_length=20)


class CommentBody(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    score: int = Field(ge=1, le=10)


def _row(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


def _comment(row: Any) -> dict[str, Any]:
    item = _row(row)
    return {
        "id": item["id"],
        "content": item["content"],
        "score": item["score"],
        "language": item.get("language"),
        "upvotes": item.get("upvotes", 0),
        "downvotes": item.get("downvotes", 0),
        "updatedAt": item["updated_at"].isoformat(),
        "user": {"id": item["user_id"], "username": item["username"]},
    }


def _product(row: Any) -> dict[str, Any]:
    item = _row(row)
    return {
        "id": item["id"],
        "title": item["title"],
        "price": item["price"],
        "url": item["url"],
        "score": float(item["score"] or 0),
        "thumbnails": item["thumbnails"] or [],
        "category": item["category"],
        "shop": {
            "id": item["shop_id"],
            "name": item["shop_name"],
            "url": item["shop_url"],
            "avatar": item["shop_avatar"],
        },
    }


PRODUCT_SELECT = """
SELECT p.id, p.title, p.price, p.url, p.category, p.shop_id,
       s.name AS shop_name, s.url AS shop_url, s.avatar_url AS shop_avatar,
       COALESCE((SELECT AVG(c.score) FROM comments c WHERE c.product_id = p.id), 0) AS score,
       COALESCE((SELECT array_agg(t.url ORDER BY t.position) FROM product_thumbnails t
                 WHERE t.product_id = p.id), ARRAY[]::text[]) AS thumbnails
FROM products p JOIN shops s ON s.id = p.shop_id
"""

COMMENT_SELECT = """
SELECT c.id, c.content, c.score, c.language, c.updated_at, c.user_id, u.username,
       COUNT(v.*) FILTER (WHERE v.value = 1)::int AS upvotes,
       COUNT(v.*) FILTER (WHERE v.value = -1)::int AS downvotes
FROM comments c JOIN users u ON u.id = c.user_id
LEFT JOIN comment_votes v ON v.comment_id = c.id
"""


def build_api_router(settings: Settings, database: object) -> APIRouter:
    router = APIRouter(prefix="/api")

    def engine() -> AsyncEngine:
        value = getattr(database, "engine", None)
        if value is None:
            raise HTTPException(status_code=503, detail="database operations unavailable")
        return cast(AsyncEngine, value)

    async def optional_user(authorization: Annotated[str | None, Header()] = None) -> str | None:
        if not authorization:
            return None
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="invalid authorization header")
        return verify_access_token(token, settings.auth_secret)

    async def current_user(user_id: Annotated[str | None, Depends(optional_user)]) -> str:
        if user_id is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return user_id

    async def tokens(user_id: str, connection: Any) -> dict[str, str]:
        refresh = new_refresh_token()
        await connection.execute(
            text("""INSERT INTO auth_sessions
                (id, user_id, refresh_token_hash, expires_at)
                VALUES (:id, :user, :hash, :expires)"""),
            {
                "id": secrets.token_urlsafe(18),
                "user": user_id,
                "hash": token_hash(refresh),
                "expires": datetime.now(UTC)
                + timedelta(seconds=settings.refresh_token_ttl_seconds),
            },
        )
        return {
            "accessToken": issue_access_token(
                user_id, settings.auth_secret, settings.access_token_ttl_seconds
            ),
            "refreshToken": refresh,
        }

    async def save_product(product: BoothProduct) -> None:
        async with engine().begin() as connection:
            await connection.execute(
                text("""INSERT INTO shops (id, name, url, avatar_url)
                    VALUES (:id, :name, :url, :avatar)
                    ON CONFLICT (id) DO UPDATE SET
                      name=EXCLUDED.name, url=EXCLUDED.url, avatar_url=EXCLUDED.avatar_url"""),
                {
                    "id": product.shop_id,
                    "name": product.shop_name,
                    "url": product.shop_url,
                    "avatar": product.shop_avatar,
                },
            )
            await connection.execute(
                text("""INSERT INTO products (id, shop_id, title, price, url, category)
                    VALUES (:id, :shop, :title, :price, :url, :category)
                    ON CONFLICT (id) DO UPDATE SET
                      shop_id=EXCLUDED.shop_id, title=EXCLUDED.title, price=EXCLUDED.price,
                      url=EXCLUDED.url, category=EXCLUDED.category"""),
                {
                    "id": product.id,
                    "shop": product.shop_id,
                    "title": product.title,
                    "price": product.price,
                    "url": product.url,
                    "category": product.category,
                },
            )
            await connection.execute(
                text("DELETE FROM product_thumbnails WHERE product_id=:id"), {"id": product.id}
            )
            for position, url in enumerate(product.thumbnails):
                await connection.execute(
                    text("""INSERT INTO product_thumbnails (product_id, position, url)
                        VALUES (:product, :position, :url)"""),
                    {"product": product.id, "position": position, "url": url},
                )

    def validate_redirect_url(redirect_url: str) -> None:
        if not re.fullmatch(r"https://[a-p]{32}\.chromiumapp\.org/", redirect_url):
            raise HTTPException(status_code=400, detail="invalid redirectUrl")

    @router.get("/auth/oauth/discord")
    async def discord_start(redirect_url: str = Query(alias="redirectUrl")) -> RedirectResponse:
        if not settings.discord_client_id:
            raise HTTPException(status_code=503, detail="Discord OAuth is not configured")
        validate_redirect_url(redirect_url)
        query = urlencode(
            {
                "client_id": settings.discord_client_id,
                "redirect_uri": redirect_url,
                "response_type": "code",
                "scope": "identify",
            }
        )
        return RedirectResponse(
            f"https://discord.com/api/oauth2/authorize?{query}", status_code=302
        )

    @router.get("/auth/oauth/discord/callback")
    async def discord_callback(
        code: str, redirect_url: str = Query(alias="redirectUrl")
    ) -> dict[str, str]:
        if not settings.discord_client_id or not settings.discord_client_secret:
            raise HTTPException(status_code=503, detail="Discord OAuth is not configured")
        validate_redirect_url(redirect_url)
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(
                "https://discord.com/api/oauth2/token",
                data={
                    "client_id": settings.discord_client_id,
                    "client_secret": settings.discord_client_secret,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_url,
                },
            )
            if token_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Discord authorization failed")
            discord_token = token_response.json().get("access_token")
            profile_response = await client.get(
                "https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {discord_token}"},
            )
            if profile_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Discord profile lookup failed")
            profile = profile_response.json()
        provider_id = str(profile["id"])
        username = str(profile.get("global_name") or profile.get("username") or provider_id)
        avatar = profile.get("avatar")
        avatar_url = (
            f"https://cdn.discordapp.com/avatars/{provider_id}/{avatar}.png" if avatar else None
        )
        async with engine().begin() as connection:
            existing = await connection.scalar(
                text(
                    """SELECT user_id FROM oauth_accounts
                    WHERE provider='discord' AND provider_user_id=:id"""
                ),
                {"id": provider_id},
            )
            user_id = str(existing or secrets.token_urlsafe(18))
            if existing is None:
                await connection.execute(
                    text("INSERT INTO users (id, username) VALUES (:id, :username)"),
                    {"id": user_id, "username": username},
                )
                await connection.execute(
                    text("""INSERT INTO oauth_accounts
                        (provider, provider_user_id, user_id, provider_username, avatar_url)
                        VALUES ('discord', :provider_id, :user_id, :username, :avatar)"""),
                    {
                        "provider_id": provider_id,
                        "user_id": user_id,
                        "username": username,
                        "avatar": avatar_url,
                    },
                )
            else:
                await connection.execute(
                    text("""UPDATE oauth_accounts
                        SET provider_username=:username, avatar_url=:avatar
                        WHERE provider='discord' AND provider_user_id=:provider_id"""),
                    {"provider_id": provider_id, "username": username, "avatar": avatar_url},
                )
            return await tokens(user_id, connection)

    @router.post("/auth/token")
    async def refresh_token(body: RefreshBody) -> dict[str, str]:
        now = datetime.now(UTC)
        async with engine().begin() as connection:
            row = (
                await connection.execute(
                    text("""SELECT id, user_id FROM auth_sessions
                        WHERE refresh_token_hash=:hash AND revoked_at IS NULL AND expires_at > :now
                        FOR UPDATE"""),
                    {"hash": token_hash(body.refresh_token), "now": now},
                )
            ).first()
            if row is None:
                raise HTTPException(status_code=401, detail="invalid refresh token")
            await connection.execute(
                text("UPDATE auth_sessions SET revoked_at=:now, last_used_at=:now WHERE id=:id"),
                {"now": now, "id": row.id},
            )
            return await tokens(str(row.user_id), connection)

    @router.get("/user/me")
    async def user_me(user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
        async with engine().connect() as connection:
            row = (
                await connection.execute(
                    text("""SELECT u.*, COALESCE(o.provider_username, '') AS discord
                        FROM users u LEFT JOIN oauth_accounts o
                        ON o.user_id=u.id AND o.provider='discord' WHERE u.id=:id"""),
                    {"id": user_id},
                )
            ).first()
        if row is None:
            raise HTTPException(status_code=401, detail="user not found")
        item = _row(row)
        return {
            "id": item["id"],
            "username": item["username"],
            "discord": item["discord"],
            "adult": item["adult"],
            "hideAvatar": item["hide_avatar"],
            "autoCollapse": item["auto_collapse"],
            "admin": item["admin"],
            "bio": item["bio"],
        }

    async def update_user(column: str, value: Any, user_id: str) -> dict[str, bool]:
        async with engine().begin() as connection:
            result = await connection.execute(
                text(f"UPDATE users SET {column}=:value WHERE id=:id"),
                {"value": value, "id": user_id},
            )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="user not found")
        return {"updated": True}

    @router.put("/user/adult")
    async def user_adult(
        user_id: Annotated[str, Depends(current_user)], adult: bool = Body(embed=True)
    ) -> dict[str, bool]:
        return await update_user("adult", adult, user_id)

    @router.put("/user/autoCollapse")
    async def user_auto_collapse(
        user_id: Annotated[str, Depends(current_user)],
        auto_collapse: bool = Body(alias="autoCollapse", embed=True),
    ) -> dict[str, bool]:
        return await update_user("auto_collapse", auto_collapse, user_id)

    @router.put("/user/hideAvatar")
    async def user_hide_avatar(
        user_id: Annotated[str, Depends(current_user)],
        hide_avatar: bool = Body(alias="hideAvatar", embed=True),
    ) -> dict[str, bool]:
        return await update_user("hide_avatar", hide_avatar, user_id)

    @router.put("/user/username")
    async def user_username(
        user_id: Annotated[str, Depends(current_user)],
        username: str = Body(embed=True, min_length=1, max_length=100),
    ) -> dict[str, bool]:
        return await update_user("username", username.strip(), user_id)

    @router.put("/user/bio")
    async def user_bio(
        user_id: Annotated[str, Depends(current_user)], bio: str = Body(embed=True, max_length=1000)
    ) -> dict[str, bool]:
        return await update_user("bio", bio.strip(), user_id)

    @router.get("/user/avatar/{user_id}")
    async def user_avatar(user_id: str) -> Response:
        async with engine().connect() as connection:
            url = await connection.scalar(
                text("""SELECT o.avatar_url FROM oauth_accounts o
                    JOIN users u ON u.id=o.user_id
                    WHERE o.user_id=:id AND o.provider='discord' AND NOT u.hide_avatar"""),
                {"id": user_id},
            )
        if not url:
            raise HTTPException(status_code=404, detail="avatar not found")
        return RedirectResponse(str(url))

    @router.get("/product/search")
    async def product_search(query: str, limit: int = Query(6, ge=1, le=100)) -> dict[str, Any]:
        async with engine().connect() as connection:
            rows = (
                await connection.execute(
                    text(
                        PRODUCT_SELECT
                        + """ WHERE p.title ILIKE :query OR p.url ILIKE :query
                        ORDER BY p.updated_at DESC LIMIT :limit"""
                    ),
                    {"query": f"%{query}%", "limit": limit},
                )
            ).all()
        return {"products": [_product(row) for row in rows]}

    @router.get("/product/{product_id}")
    async def product(product_id: str) -> dict[str, Any]:
        async with engine().connect() as connection:
            row = (
                await connection.execute(
                    text(PRODUCT_SELECT + " WHERE p.id=:id"), {"id": product_id}
                )
            ).first()
        if row is None:
            raise HTTPException(status_code=404, detail="product not found")
        return {"product": _product(row)}

    @router.get("/comment")
    async def comments(
        product_id: str = Query(alias="productId"),
        page: int = Query(1, ge=1),
        limit: int = Query(10, ge=1, le=100),
    ) -> dict[str, Any]:
        async with engine().connect() as connection:
            count = await connection.scalar(
                text("SELECT COUNT(*) FROM comments WHERE product_id=:id"), {"id": product_id}
            )
            rows = (
                await connection.execute(
                    text(
                        COMMENT_SELECT
                        + """ WHERE c.product_id=:id GROUP BY c.id, u.id
                        ORDER BY c.updated_at DESC, c.id DESC LIMIT :limit OFFSET :offset"""
                    ),
                    {"id": product_id, "limit": limit, "offset": (page - 1) * limit},
                )
            ).all()
        return {"count": int(count or 0), "comments": [_comment(row) for row in rows]}

    @router.get("/comment/my")
    async def my_comments(
        user_id: Annotated[str, Depends(current_user)],
        page: int = Query(1, ge=1),
        limit: int = Query(5, ge=1, le=100),
    ) -> dict[str, Any]:
        async with engine().connect() as connection:
            count = await connection.scalar(
                text("SELECT COUNT(*) FROM comments WHERE user_id=:id"), {"id": user_id}
            )
            rows = (
                await connection.execute(
                    text(
                        COMMENT_SELECT
                        + """ WHERE c.user_id=:id GROUP BY c.id, u.id
                        ORDER BY c.updated_at DESC, c.id DESC LIMIT :limit OFFSET :offset"""
                    ),
                    {"id": user_id, "limit": limit, "offset": (page - 1) * limit},
                )
            ).all()
        return {"count": int(count or 0), "comments": [_comment(row) for row in rows]}

    @router.get("/comment/{product_id}/my")
    async def my_comment(
        product_id: str, user_id: Annotated[str, Depends(current_user)]
    ) -> dict[str, Any]:
        async with engine().connect() as connection:
            row = (
                await connection.execute(
                    text(
                        """SELECT id, content, score FROM comments
                        WHERE product_id=:product AND user_id=:user"""
                    ),
                    {"product": product_id, "user": user_id},
                )
            ).first()
        if row is None:
            raise HTTPException(status_code=404, detail="comment not found")
        return {"comment": _row(row)}

    @router.post("/comment/{product_id}")
    async def create_comment(
        product_id: str, body: CommentBody, user_id: Annotated[str, Depends(current_user)]
    ) -> dict[str, str]:
        comment_id = secrets.token_urlsafe(18)
        async with engine().connect() as connection:
            product_exists = await connection.scalar(
                text("SELECT 1 FROM products WHERE id=:id"), {"id": product_id}
            )
        if not product_exists:
            try:
                booth_product = await fetch_product(product_id)
            except httpx.HTTPError as error:
                raise HTTPException(
                    status_code=502, detail="failed to fetch BOOTH product"
                ) from error
            if booth_product is None:
                raise HTTPException(status_code=404, detail="product not found")
            await save_product(booth_product)
        async with engine().begin() as connection:
            try:
                await connection.execute(
                    text(
                        """INSERT INTO comments (id, product_id, user_id, content, score)
                        VALUES (:id, :product, :user, :content, :score)"""
                    ),
                    {
                        "id": comment_id,
                        "product": product_id,
                        "user": user_id,
                        "content": body.content.strip(),
                        "score": body.score,
                    },
                )
            except Exception as error:
                raise HTTPException(status_code=409, detail="comment already exists") from error
        return {"id": comment_id}

    @router.put("/comment/{product_id}")
    async def update_comment(
        product_id: str, body: CommentBody, user_id: Annotated[str, Depends(current_user)]
    ) -> dict[str, bool]:
        async with engine().begin() as connection:
            result = await connection.execute(
                text(
                    """UPDATE comments SET content=:content, score=:score
                    WHERE product_id=:product AND user_id=:user"""
                ),
                {
                    "content": body.content.strip(),
                    "score": body.score,
                    "product": product_id,
                    "user": user_id,
                },
            )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="comment not found")
        return {"updated": True}

    @router.delete("/comment/{product_id}")
    async def delete_comment(
        product_id: str, user_id: Annotated[str, Depends(current_user)]
    ) -> dict[str, bool]:
        async with engine().begin() as connection:
            result = await connection.execute(
                text("DELETE FROM comments WHERE product_id=:product AND user_id=:user"),
                {"product": product_id, "user": user_id},
            )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="comment not found")
        return {"deleted": True}

    async def vote(comment_id: str, value: int, user_id: str) -> dict[str, bool]:
        async with engine().begin() as connection:
            owner = await connection.scalar(
                text("SELECT user_id FROM comments WHERE id=:id"), {"id": comment_id}
            )
            if owner is None:
                raise HTTPException(status_code=404, detail="comment not found")
            if owner == user_id:
                direction = "upvote" if value == 1 else "downvote"
                raise HTTPException(status_code=400, detail=f"cannot {direction} your own comment")
            parameters = {"comment": comment_id, "user": user_id, "value": value}
            current = await connection.scalar(
                text("""SELECT value FROM comment_votes
                    WHERE comment_id=:comment AND user_id=:user"""),
                parameters,
            )
            if current == value:
                await connection.execute(
                    text("""DELETE FROM comment_votes
                        WHERE comment_id=:comment AND user_id=:user"""),
                    parameters,
                )
            else:
                await connection.execute(
                    text("""INSERT INTO comment_votes (comment_id, user_id, value)
                        VALUES (:comment, :user, :value)
                        ON CONFLICT (comment_id, user_id) DO UPDATE SET value=:value"""),
                    parameters,
                )
        return {"updated": True}

    @router.post("/comment/{comment_id}/upvote")
    async def upvote(
        comment_id: str, user_id: Annotated[str, Depends(current_user)]
    ) -> dict[str, bool]:
        return await vote(comment_id, 1, user_id)

    @router.post("/comment/{comment_id}/downvote")
    async def downvote(
        comment_id: str, user_id: Annotated[str, Depends(current_user)]
    ) -> dict[str, bool]:
        return await vote(comment_id, -1, user_id)

    return router
