from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    SmallInteger,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    metadata = MetaData()


def timestamp_columns() -> tuple[Column[datetime], Column[datetime]]:
    return (
        Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
        Column(
            "updated_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )


users = Table(
    "users",
    Base.metadata,
    Column("id", Text, primary_key=True),
    Column("username", Text, nullable=False),
    Column("bio", Text, nullable=False, server_default=""),
    Column("adult", Boolean, nullable=False, server_default="false"),
    Column("hide_avatar", Boolean, nullable=False, server_default="false"),
    Column("auto_collapse", Boolean, nullable=False, server_default="false"),
    Column("admin", Boolean, nullable=False, server_default="false"),
    *timestamp_columns(),
    CheckConstraint("char_length(btrim(username)) > 0"),
)

oauth_accounts = Table(
    "oauth_accounts",
    Base.metadata,
    Column("provider", Text, primary_key=True),
    Column("provider_user_id", Text, primary_key=True),
    Column("user_id", Text, ForeignKey("users.id", ondelete="CASCADE")),
    Column("provider_username", Text, nullable=False),
    Column("avatar_url", Text),
    *timestamp_columns(),
    CheckConstraint("char_length(btrim(provider)) > 0"),
    UniqueConstraint("user_id", "provider"),
)

auth_sessions = Table(
    "auth_sessions",
    Base.metadata,
    Column("id", Text, primary_key=True),
    Column("user_id", Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("refresh_token_hash", Text, nullable=False, unique=True),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("last_used_at", DateTime(timezone=True)),
    Column("revoked_at", DateTime(timezone=True)),
    *timestamp_columns(),
)
Index(
    "auth_sessions_user_state_idx",
    auth_sessions.c.user_id,
    auth_sessions.c.revoked_at,
    auth_sessions.c.expires_at,
)
Index("auth_sessions_expiry_idx", auth_sessions.c.expires_at)

shops = Table(
    "shops",
    Base.metadata,
    Column("id", Text, primary_key=True),
    Column("name", Text, nullable=False),
    Column("url", Text, nullable=False, unique=True),
    Column("avatar_url", Text, nullable=False, server_default=""),
    *timestamp_columns(),
    CheckConstraint("char_length(btrim(name)) > 0"),
)

products = Table(
    "products",
    Base.metadata,
    Column("id", Text, primary_key=True),
    Column("shop_id", Text, ForeignKey("shops.id", ondelete="RESTRICT"), nullable=False),
    Column("title", Text, nullable=False),
    Column("price", Text, nullable=False, server_default=""),
    Column("url", Text, nullable=False, unique=True),
    Column("category", Text, nullable=False, server_default=""),
    *timestamp_columns(),
    CheckConstraint("char_length(btrim(title)) > 0"),
)
Index("products_shop_idx", products.c.shop_id)
Index("products_title_lower_idx", func.lower(products.c.title))

product_thumbnails = Table(
    "product_thumbnails",
    Base.metadata,
    Column("product_id", Text, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("position", Integer, primary_key=True),
    Column("url", Text, nullable=False),
    CheckConstraint("position >= 0"),
    CheckConstraint("char_length(btrim(url)) > 0"),
    UniqueConstraint("product_id", "url"),
)

comments = Table(
    "comments",
    Base.metadata,
    Column("id", Text, primary_key=True),
    Column("product_id", Text, ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
    Column("user_id", Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("content", Text, nullable=False),
    Column("score", SmallInteger, nullable=False),
    Column("language", Text),
    *timestamp_columns(),
    CheckConstraint("char_length(btrim(content)) > 0"),
    CheckConstraint("score BETWEEN 1 AND 10"),
    CheckConstraint("language IS NULL OR char_length(btrim(language)) > 0"),
    UniqueConstraint("user_id", "product_id"),
)
Index(
    "comments_product_new_idx",
    comments.c.product_id,
    comments.c.updated_at.desc(),
    comments.c.id.desc(),
)
Index(
    "comments_user_new_idx", comments.c.user_id, comments.c.updated_at.desc(), comments.c.id.desc()
)

comment_votes = Table(
    "comment_votes",
    Base.metadata,
    Column("comment_id", Text, ForeignKey("comments.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("value", SmallInteger, nullable=False),
    *timestamp_columns(),
    CheckConstraint("value IN (-1, 1)"),
)
Index("comment_votes_user_idx", comment_votes.c.user_id, comment_votes.c.updated_at.desc())
