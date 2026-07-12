from pathlib import Path

from alembic import context, op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[2] / "migrations" / "0001_initial.sql"


def _sections() -> tuple[str, str]:
    source = SQL_FILE.read_text(encoding="utf-8")
    up, down = source.split("-- Down Migration", 1)
    return up.replace("-- Up Migration", "", 1).strip(), down.strip()


def upgrade() -> None:
    up, _ = _sections()
    _execute_script(up)


def downgrade() -> None:
    _, down = _sections()
    _execute_script(down)


def _execute_script(script: str) -> None:
    if context.is_offline_mode():
        op.execute(script)
        return

    # psycopg's extended protocol rejects multi-statement prepared queries.
    # Alembic owns the surrounding transaction; prepare=False keeps the whole
    # SQL migration in that transaction while allowing function bodies.
    driver_connection = op.get_bind().connection.driver_connection
    with driver_connection.cursor() as cursor:
        cursor.execute(script, prepare=False)
