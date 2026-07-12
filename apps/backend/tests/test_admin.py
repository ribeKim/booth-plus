from datetime import UTC, datetime

from booth_plus.admin import _date, _legacy_user, _scalar


def test_legacy_value_conversion() -> None:
    assert _scalar({"$oid": "507f1f77bcf86cd799439011"}) == "507f1f77bcf86cd799439011"
    assert _date({"$date": "2025-01-02T03:04:05Z"}) == datetime(
        2025, 1, 2, 3, 4, 5, tzinfo=UTC
    )


def test_legacy_user_is_namespaced() -> None:
    user_id, username = _legacy_user(
        {"userId": {"$oid": "abc123"}, "user": {"username": "legacy-user"}}
    )

    assert user_id == "legacy:abc123"
    assert username == "legacy-user"
