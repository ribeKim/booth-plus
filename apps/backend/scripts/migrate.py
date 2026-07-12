from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from alembic import command
from alembic.config import Config
from booth_plus.config import load_settings
from booth_plus.database import alembic_config_url, connection_kwargs, sqlalchemy_url

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    settings = load_settings()
    url = sqlalchemy_url(settings.database_url)
    config = Config(ROOT / "alembic.ini")
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", alembic_config_url(settings.database_url))
    config.attributes["connection_kwargs"] = connection_kwargs(settings)

    # Databases created by the former node-pg-migrate/custom runner already
    # contain the initial schema. Stamp those once instead of recreating tables.
    engine = create_engine(url, connect_args=connection_kwargs(settings))
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names(schema="public"))
        legacy_applied = False
        if "alembic_version" not in tables and "app_migrations" in tables:
            legacy_applied = bool(
                connection.scalar(
                    text("SELECT 1 FROM public.app_migrations WHERE name = :name"),
                    {"name": "0001_initial"},
                )
            )
    engine.dispose()

    if legacy_applied:
        command.stamp(config, "head")
    else:
        command.upgrade(config, "head")


if __name__ == "__main__":
    main()
