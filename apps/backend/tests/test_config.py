import pytest

from booth_plus.config import load_settings


def test_requires_database_url() -> None:
    with pytest.raises(ValueError, match="DATABASE_URL"):
        load_settings({"DATABASE_SSL_MODE": "disable"})


def test_rejects_tls_query_parameters() -> None:
    with pytest.raises(ValueError, match="outside DATABASE_URL"):
        load_settings(
            {
                "DATABASE_URL": "postgresql://user:pass@localhost/db?sslmode=require",
                "DATABASE_SSL_MODE": "disable",
            }
        )


def test_builds_database_url_from_password_file(tmp_path) -> None:
    password_file = tmp_path / "postgres-password"
    password_file.write_text("p@ss/word\n", encoding="utf-8")

    settings = load_settings(
        {
            "DATABASE_PASSWORD_FILE": str(password_file),
            "DATABASE_HOST": "postgres",
            "DATABASE_PORT": "5432",
            "DATABASE_NAME": "booth_plus",
            "DATABASE_USER": "booth_plus",
            "DATABASE_SSL_MODE": "disable",
        }
    )

    assert settings.database_url == "postgresql://booth_plus:p%40ss%2Fword@postgres:5432/booth_plus"
