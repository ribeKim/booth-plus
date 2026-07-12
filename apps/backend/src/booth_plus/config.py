from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlsplit


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    cors_origins: tuple[str, ...]
    database_url: str
    database_ssl_mode: str
    database_ssl_ca_file: str | None
    database_pool_max: int
    database_connect_timeout_ms: int
    database_statement_timeout_ms: int
    database_max_lifetime_seconds: int
    rate_limit_window_ms: int
    rate_limit_max_requests: int
    rate_limit_write_max_requests: int
    auth_secret: str
    access_token_ttl_seconds: int
    refresh_token_ttl_seconds: int
    discord_client_id: str
    discord_client_secret: str


def _integer(env: dict[str, str], name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(env.get(name, str(default)))
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _database_url(env: dict[str, str]) -> str:
    inline = env.get("DATABASE_URL", "").strip()
    file_name = env.get("DATABASE_URL_FILE", "").strip()
    password_file = env.get("DATABASE_PASSWORD_FILE", "").strip()
    if sum(bool(item) for item in (inline, file_name, password_file)) > 1:
        raise ValueError(
            "Set exactly one of DATABASE_URL, DATABASE_URL_FILE, or DATABASE_PASSWORD_FILE"
        )
    if password_file:
        password = Path(password_file).read_text(encoding="utf-8").strip()
        host = env.get("DATABASE_HOST", "").strip()
        user = env.get("DATABASE_USER", "").strip()
        name = env.get("DATABASE_NAME", "").strip()
        port = _integer(env, "DATABASE_PORT", 5432, 1, 65535)
        if not password or not host or not user or not name:
            raise ValueError(
                "DATABASE_PASSWORD_FILE requires DATABASE_HOST, DATABASE_USER, and DATABASE_NAME"
            )
        value = (
            f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@"
            f"{host}:{port}/{quote(name, safe='')}"
        )
    else:
        value = Path(file_name).read_text(encoding="utf-8").strip() if file_name else inline
    parsed = urlsplit(value)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise ValueError("DATABASE_URL must be a valid PostgreSQL URL")
    forbidden = {"ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation"}
    conflicts = sorted(
        {key.lower() for key, _ in parse_qsl(parsed.query) if key.lower() in forbidden}
    )
    if conflicts:
        raise ValueError("Configure PostgreSQL TLS outside DATABASE_URL: " + ", ".join(conflicts))
    return value


def load_settings(environment: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if environment is None else environment)
    ssl_mode = env.get("DATABASE_SSL_MODE", "verify-full").strip()
    if ssl_mode not in {"disable", "require", "verify-full"}:
        raise ValueError("DATABASE_SSL_MODE must be disable, require, or verify-full")
    ca_file = env.get("DATABASE_SSL_CA_FILE", "").strip() or None
    if ssl_mode == "verify-full" and not ca_file:
        raise ValueError("DATABASE_SSL_CA_FILE is required when DATABASE_SSL_MODE is verify-full")
    origins = tuple(item.strip() for item in env.get("CORS_ORIGINS", "").split(",") if item.strip())
    return Settings(
        host=env.get("HOST", "0.0.0.0").strip(),
        port=_integer(env, "PORT", 3000, 1, 65535),
        cors_origins=origins,
        database_url=_database_url(env),
        database_ssl_mode=ssl_mode,
        database_ssl_ca_file=ca_file,
        database_pool_max=_integer(env, "DATABASE_POOL_MAX", 10, 1, 100),
        database_connect_timeout_ms=_integer(env, "DATABASE_CONNECT_TIMEOUT_MS", 5000, 100, 60000),
        database_statement_timeout_ms=_integer(
            env, "DATABASE_STATEMENT_TIMEOUT_MS", 5000, 100, 120000
        ),
        database_max_lifetime_seconds=_integer(
            env, "DATABASE_MAX_LIFETIME_SECONDS", 300, 30, 86400
        ),
        rate_limit_window_ms=_integer(env, "RATE_LIMIT_WINDOW_MS", 60000, 1000, 3600000),
        rate_limit_max_requests=_integer(env, "RATE_LIMIT_MAX_REQUESTS", 300, 1, 100000),
        rate_limit_write_max_requests=_integer(env, "RATE_LIMIT_WRITE_MAX_REQUESTS", 60, 1, 100000),
        auth_secret=env.get("AUTH_SECRET", "development-only-change-me").strip(),
        access_token_ttl_seconds=_integer(env, "ACCESS_TOKEN_TTL_SECONDS", 900, 60, 86400),
        refresh_token_ttl_seconds=_integer(
            env, "REFRESH_TOKEN_TTL_SECONDS", 2592000, 3600, 31536000
        ),
        discord_client_id=env.get("DISCORD_CLIENT_ID", "").strip(),
        discord_client_secret=env.get("DISCORD_CLIENT_SECRET", "").strip(),
    )
