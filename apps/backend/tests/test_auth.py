import time

import pytest
from fastapi import HTTPException

from booth_plus.auth import (
    hash_anonymous_password,
    issue_access_token,
    token_hash,
    verify_access_token,
    verify_anonymous_password,
)


def test_access_token_round_trip() -> None:
    token = issue_access_token("user-1", "test-secret", 60)

    assert verify_access_token(token, "test-secret") == "user-1"
    assert token_hash("refresh-token") != "refresh-token"


def test_access_token_rejects_tampering_and_expiry(monkeypatch: pytest.MonkeyPatch) -> None:
    token = issue_access_token("user-1", "test-secret", 60)
    with pytest.raises(HTTPException):
        verify_access_token(token + "x", "test-secret")

    monkeypatch.setattr(time, "time", lambda: 2_000_000_000)
    with pytest.raises(HTTPException):
        verify_access_token(token, "test-secret")


def test_anonymous_password_is_salted_and_verifiable() -> None:
    first = hash_anonymous_password("correct horse battery staple")
    second = hash_anonymous_password("correct horse battery staple")

    assert first != second
    assert "correct horse" not in first
    assert verify_anonymous_password("correct horse battery staple", first)
    assert not verify_anonymous_password("wrong password", first)
    assert not verify_anonymous_password("anything", "disabled$legacy-comment")
