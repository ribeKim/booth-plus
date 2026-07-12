from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Protocol, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from .auth import verify_access_token
from .booth import BoothProduct, fetch_product
from .config import Settings


class AdminDatabase(Protocol):
    engine: AsyncEngine


class LegacyImportBody(BaseModel):
    comments: list[dict[str, Any]] = Field(max_length=5000)


class DisabledBody(BaseModel):
    disabled: bool


def _scalar(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("$oid", "$date", "id", "_id"):
            if key in value:
                return _scalar(value[key])
    return "" if value is None else str(value).strip()


def _date(value: Any) -> datetime:
    raw = _scalar(value)
    if not raw:
        return datetime.now(UTC)
    try:
        if raw.isdigit():
            timestamp = float(raw)
            if timestamp > 10_000_000_000:
                timestamp /= 1000
            return datetime.fromtimestamp(timestamp, UTC)
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(UTC)
    except (ValueError, OSError):
        return datetime.now(UTC)


def _legacy_user(record: dict[str, Any]) -> tuple[str | None, str]:
    raw_user = record.get("user")
    raw_id = record.get("userId")
    if not raw_id and isinstance(raw_user, dict):
        raw_id = raw_user.get("_id") or raw_user.get("id")
    user_id = _scalar(raw_id)
    if not user_id:
        return None, "익명"
    username = ""
    if isinstance(raw_user, dict):
        username = _scalar(
            raw_user.get("username") or raw_user.get("displayName") or raw_user.get("name")
        )
    elif isinstance(raw_user, str):
        username = raw_user.strip()
    return f"legacy:{user_id}", username or f"legacy-{user_id[-8:]}"


def build_admin_router(settings: Settings, database: object) -> APIRouter:
    router = APIRouter(prefix="/api/admin")

    def engine() -> AsyncEngine:
        value = getattr(database, "engine", None)
        if value is None:
            raise HTTPException(status_code=503, detail="database operations unavailable")
        return cast(AsyncEngine, value)

    async def current_admin(authorization: Annotated[str | None, Header()] = None) -> str:
        if not authorization:
            raise HTTPException(status_code=401, detail="authentication required")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="invalid authorization header")
        user_id = verify_access_token(token, settings.auth_secret)
        async with engine().connect() as connection:
            is_admin = await connection.scalar(
                text("SELECT admin FROM users WHERE id=:id"), {"id": user_id}
            )
        if not is_admin:
            raise HTTPException(status_code=403, detail="administrator access required")
        return user_id

    async def save_product(product: BoothProduct) -> None:
        async with engine().begin() as connection:
            await connection.execute(
                text("""INSERT INTO shops (id, name, url, avatar_url)
                    VALUES (:id, :name, :url, :avatar)
                    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,
                      url=EXCLUDED.url, avatar_url=EXCLUDED.avatar_url"""),
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
                    ON CONFLICT (id) DO UPDATE SET shop_id=EXCLUDED.shop_id,
                      title=EXCLUDED.title, price=EXCLUDED.price,
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

    async def ensure_product(product_id: str) -> bool:
        async with engine().connect() as connection:
            if await connection.scalar(
                text("SELECT 1 FROM products WHERE id=:id"), {"id": product_id}
            ):
                return True
        try:
            product = await fetch_product(product_id)
        except Exception:
            product = None
        if product is None:
            product = BoothProduct(
                id=product_id,
                title=f"BOOTH item {product_id}",
                price="",
                url=f"https://booth.pm/ja/items/{product_id}",
                category="legacy-import",
                thumbnails=(),
                shop_id="legacy-import",
                shop_name="Legacy import",
                shop_url="https://booth.pm/",
                shop_avatar="",
            )
        await save_product(product)
        return True

    async def ensure_legacy_user(connection: Any, user_id: str, username: str) -> None:
        await connection.execute(
            text("""INSERT INTO users (id, username) VALUES (:id, :username)
                ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username"""),
            {"id": user_id, "username": username},
        )

    @router.get("/comments")
    async def comments(
        admin_user_id: str = Depends(current_admin),
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        query: str = Query("", max_length=200),
    ) -> dict[str, Any]:
        del admin_user_id
        pattern = f"%{query.strip()}%"
        condition = """(:query = '' OR c.content ILIKE :pattern OR c.product_id ILIKE :pattern
            OR COALESCE(u.username, '익명') ILIKE :pattern)"""
        parameters = {"query": query.strip(), "pattern": pattern}
        async with engine().connect() as connection:
            count = await connection.scalar(
                text(
                    "SELECT COUNT(*) FROM comments c "
                    f"LEFT JOIN users u ON u.id=c.user_id WHERE {condition}"
                ),
                parameters,
            )
            rows = (
                await connection.execute(
                    text(
                        f"""SELECT c.id, c.product_id, c.content, c.score, c.language,
                            c.disabled, c.created_at, c.updated_at,
                            COALESCE(c.user_id, 'anonymous:' || c.id) AS user_id,
                            COALESCE(u.username, '익명') AS username,
                            COUNT(v.*) FILTER (WHERE v.value=1)::int AS upvotes,
                            COUNT(v.*) FILTER (WHERE v.value=-1)::int AS downvotes
                        FROM comments c LEFT JOIN users u ON u.id=c.user_id
                        LEFT JOIN comment_votes v ON v.comment_id=c.id
                        WHERE {condition}
                        GROUP BY c.id, u.id ORDER BY c.updated_at DESC, c.id DESC
                        LIMIT :limit OFFSET :offset"""
                    ),
                    {**parameters, "limit": limit, "offset": (page - 1) * limit},
                )
            ).mappings().all()
        items = [
            {
                "id": row["id"],
                "productId": row["product_id"],
                "content": row["content"],
                "score": row["score"],
                "language": row["language"],
                "disabled": row["disabled"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
                "upvotes": row["upvotes"],
                "downvotes": row["downvotes"],
                "user": {"id": row["user_id"], "username": row["username"]},
            }
            for row in rows
        ]
        return {"count": int(count or 0), "comments": items}

    @router.put("/comments/{comment_id}/disabled")
    async def set_disabled(
        comment_id: str,
        body: DisabledBody,
        admin_user_id: str = Depends(current_admin),
    ) -> dict[str, bool]:
        del admin_user_id
        async with engine().begin() as connection:
            result = await connection.execute(
                text("UPDATE comments SET disabled=:disabled WHERE id=:id"),
                {"disabled": body.disabled, "id": comment_id},
            )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="comment not found")
        return {"updated": True}

    @router.delete("/comments/{comment_id}")
    async def delete_comment(
        comment_id: str, admin_user_id: str = Depends(current_admin)
    ) -> dict[str, bool]:
        del admin_user_id
        async with engine().begin() as connection:
            result = await connection.execute(
                text("DELETE FROM comments WHERE id=:id"), {"id": comment_id}
            )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="comment not found")
        return {"deleted": True}

    @router.post("/imports/comments")
    async def import_comments(
        body: LegacyImportBody,
        admin_user_id: str = Depends(current_admin),
    ) -> dict[str, Any]:
        del admin_user_id
        imported = 0
        skipped = 0
        errors: list[str] = []
        ensured_products: set[str] = set()
        for index, record in enumerate(body.comments):
            comment_id = _scalar(record.get("_id"))
            product_id = _scalar(record.get("productId"))
            content = _scalar(record.get("content"))
            try:
                score = int(record.get("score", 0))
            except (TypeError, ValueError):
                score = 0
            if not comment_id or not product_id or not content or not 1 <= score <= 10:
                skipped += 1
                if len(errors) < 50:
                    errors.append(f"row {index + 1}: missing or invalid required fields")
                continue
            try:
                if product_id not in ensured_products:
                    if not await ensure_product(product_id):
                        raise ValueError(f"BOOTH product {product_id} was not found")
                    ensured_products.add(product_id)
                user_id, username = _legacy_user(record)
                created_at = _date(record.get("createdAt"))
                updated_at = _date(record.get("updatedAt") or record.get("createdAt"))
                async with engine().begin() as connection:
                    if user_id:
                        await ensure_legacy_user(connection, user_id, username)
                    await connection.execute(
                        text("""INSERT INTO comments
                            (id, product_id, user_id, content, score, language,
                             disabled, created_at, updated_at)
                            VALUES (:id, :product, :user, :content, :score, :language,
                                    :disabled, :created, :updated)
                            ON CONFLICT (id) DO UPDATE SET product_id=EXCLUDED.product_id,
                              user_id=EXCLUDED.user_id, content=EXCLUDED.content,
                              score=EXCLUDED.score, language=EXCLUDED.language,
                              disabled=EXCLUDED.disabled, created_at=EXCLUDED.created_at,
                              updated_at=EXCLUDED.updated_at"""),
                        {
                            "id": comment_id,
                            "product": product_id,
                            "user": user_id,
                            "content": content,
                            "score": score,
                            "language": _scalar(record.get("language")) or None,
                            "disabled": bool(record.get("disabled", False)),
                            "created": created_at,
                            "updated": updated_at,
                        },
                    )
                    await connection.execute(
                        text("DELETE FROM comment_votes WHERE comment_id=:id"), {"id": comment_id}
                    )
                    votes: dict[str, int] = {}
                    for value, field in ((1, "upvoteUsers"), (-1, "downvoteUsers")):
                        raw_users = record.get(field) or []
                        if not isinstance(raw_users, list):
                            continue
                        for raw_user in raw_users:
                            legacy_id = _scalar(raw_user)
                            if legacy_id:
                                votes[f"legacy:{legacy_id}"] = value
                    for vote_user_id, value in votes.items():
                        await ensure_legacy_user(
                            connection, vote_user_id, f"legacy-{vote_user_id[-8:]}"
                        )
                        await connection.execute(
                            text("""INSERT INTO comment_votes (comment_id, user_id, value)
                                VALUES (:comment, :user, :value)"""),
                            {"comment": comment_id, "user": vote_user_id, "value": value},
                        )
                imported += 1
            except Exception as error:
                skipped += 1
                if len(errors) < 50:
                    errors.append(f"row {index + 1}: {error}")
        return {"imported": imported, "skipped": skipped, "errors": errors}

    return router
