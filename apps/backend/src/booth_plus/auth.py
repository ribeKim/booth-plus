from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import HTTPException


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_access_token(user_id: str, secret: str, ttl_seconds: int) -> str:
    payload = _encode(
        json.dumps(
            {"sub": user_id, "exp": int(time.time()) + ttl_seconds}, separators=(",", ":")
        ).encode()
    )
    signature = _encode(hmac.digest(secret.encode(), payload.encode(), "sha256"))
    return f"{payload}.{signature}"


def verify_access_token(token: str, secret: str) -> str:
    try:
        payload, signature = token.split(".", 1)
        expected = _encode(hmac.digest(secret.encode(), payload.encode(), "sha256"))
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        data: dict[str, Any] = json.loads(_decode(payload))
        if int(data["exp"]) <= int(time.time()) or not isinstance(data["sub"], str):
            raise ValueError
        return data["sub"]
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=401, detail="invalid or expired access token") from error


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
