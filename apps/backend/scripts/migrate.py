from __future__ import annotations

from pathlib import Path

import psycopg

from booth_plus.config import load_settings
from booth_plus.database import connection_kwargs


def main() -> None:
    settings = load_settings()
    migrations = Path(__file__).resolve().parent.parent / "migrations"
    with psycopg.connect(settings.database_url, **connection_kwargs(settings)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """CREATE TABLE IF NOT EXISTS public.app_migrations (
                    id serial PRIMARY KEY,
                    name text NOT NULL UNIQUE,
                    run_on timestamptz NOT NULL DEFAULT now()
                )"""
            )
            for path in sorted(migrations.glob("*.sql")):
                name = path.stem
                cursor.execute("SELECT 1 FROM public.app_migrations WHERE name = %s", (name,))
                if cursor.fetchone():
                    continue
                up_sql = (
                    path.read_text(encoding="utf-8")
                    .split("-- Down Migration", 1)[0]
                    .replace("-- Up Migration", "", 1)
                )
                cursor.execute(up_sql)
                cursor.execute("INSERT INTO public.app_migrations (name) VALUES (%s)", (name,))
        connection.commit()


if __name__ == "__main__":
    main()
