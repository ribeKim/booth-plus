from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from booth_plus.config import load_settings
from booth_plus.database import connection_kwargs, sqlalchemy_url
from booth_plus.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

if not config.get_main_option("sqlalchemy.url"):
    settings = load_settings()
    config.set_main_option(
        "sqlalchemy.url",
        sqlalchemy_url(settings.database_url).render_as_string(hide_password=False),
    )
    config.attributes["connection_kwargs"] = connection_kwargs(settings)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=config.attributes.get("connection_kwargs", {}),
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
