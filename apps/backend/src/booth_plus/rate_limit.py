from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: object, *, window_ms: int, maximum: int, write_maximum: int) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.window = window_ms / 1000
        self.maximum = maximum
        self.write_maximum = write_maximum
        self.requests: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if not request.url.path.startswith("/api/") or request.url.path.startswith("/api/health"):
            return await call_next(request)
        client = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        client = client or (request.client.host if request.client else "unknown")
        bucket = "write" if request.method in {"POST", "PUT", "PATCH", "DELETE"} else "api"
        maximum = self.write_maximum if bucket == "write" else self.maximum
        timestamps = self.requests[(client, bucket)]
        now = time.monotonic()
        while timestamps and timestamps[0] <= now - self.window:
            timestamps.popleft()
        if len(timestamps) >= maximum:
            retry_after = max(1, int(timestamps[0] + self.window - now) + 1)
            return Response(status_code=429, headers={"Retry-After": str(retry_after)})
        timestamps.append(now)
        return await call_next(request)
