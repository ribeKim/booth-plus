from configparser import ConfigParser

from booth_plus.database import alembic_config_url


def test_alembic_url_preserves_percent_encoded_password() -> None:
    parser = ConfigParser()
    parser.add_section("alembic")
    parser.set(
        "alembic",
        "sqlalchemy.url",
        alembic_config_url("postgresql://booth_plus:p%40ss%2Fword@postgres:5432/booth_plus"),
    )

    assert parser.get("alembic", "sqlalchemy.url") == (
        "postgresql+psycopg://booth_plus:p%40ss%2Fword@postgres:5432/booth_plus"
    )
