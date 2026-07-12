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
