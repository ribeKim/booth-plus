from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit


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
    rate_limit_window_ms: int
    rate_limit_max_requests: int
    rate_limit_write_max_requests: int


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
    if inline and file_name:
        raise ValueError("Set only one of DATABASE_URL or DATABASE_URL_FILE")
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
        rate_limit_window_ms=_integer(env, "RATE_LIMIT_WINDOW_MS", 60000, 1000, 3600000),
        rate_limit_max_requests=_integer(env, "RATE_LIMIT_MAX_REQUESTS", 300, 1, 100000),
        rate_limit_write_max_requests=_integer(env, "RATE_LIMIT_WRITE_MAX_REQUESTS", 60, 1, 100000),
    )
