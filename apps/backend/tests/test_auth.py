import time

import pytest
from fastapi import HTTPException

from booth_plus.auth import issue_access_token, token_hash, verify_access_token


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
