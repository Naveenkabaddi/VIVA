"""Request logging and in-memory rate limiting middleware."""
from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger("viva.requests")
security_logger = logging.getLogger("viva.security")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        if request.url.path.startswith("/api"):
            logger.info(
                "%s %s -> %s (%.1f ms)",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )
        response.headers["X-Process-Time-Ms"] = f"{duration_ms:.1f}"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple sliding-window limiter.

    Suitable for a single backend instance. For multi-instance production
    deployments, replace the in-memory store with Redis (documented in
    docs/DEPLOYMENT.md).
    """

    def __init__(self, app, limit_per_minute: int | None = None) -> None:
        super().__init__(app)
        self.limit = limit_per_minute or settings.rate_limit_per_minute
        self.window = 60.0
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if (
            not path.startswith("/api")
            or request.method == "OPTIONS"
            or path in {"/api/health"}
            or self.limit <= 0
        ):
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[client]
            while bucket and now - bucket[0] > self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                retry_after = max(1, int(self.window - (now - bucket[0])))
                security_logger.warning("Rate limit exceeded for %s on %s", client, path)
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Too many requests. Try again in about {retry_after} seconds.",
                        "code": "rate_limited",
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)
            if len(self._hits) > 5000:
                for key in [key for key, value in self._hits.items() if not value][:1000]:
                    self._hits.pop(key, None)
        return await call_next(request)
