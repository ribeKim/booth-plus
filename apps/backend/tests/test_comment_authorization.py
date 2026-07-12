import pytest
from fastapi import HTTPException

from booth_plus.auth import hash_anonymous_password
from booth_plus.routes import _authorize_comment


def test_registered_comment_requires_matching_user() -> None:
    row = {"user_id": "owner", "anonymous_password_hash": None}

    _authorize_comment(row, "owner", None)
    with pytest.raises(HTTPException) as caught:
        _authorize_comment(row, "other-user", None)

    assert caught.value.status_code == 404


def test_anonymous_comment_requires_matching_password() -> None:
    row = {
        "user_id": None,
        "anonymous_password_hash": hash_anonymous_password("secret-password"),
    }

    _authorize_comment(row, None, "secret-password")
    with pytest.raises(HTTPException) as caught:
        _authorize_comment(row, None, "wrong-password")

    assert caught.value.status_code == 403
