"""
Redis-based sliding-window rate limiter for the Collector API.

Limits are enforced per API key (or per project_id if no key is present).
Uses a Redis sorted set with timestamped entries for a precise sliding window.
"""
import time
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from database import redis_client

logger = logging.getLogger("aiops.ratelimit")

# Defaults — override via environment or a config table
DEFAULT_WINDOW_SECS = 60
DEFAULT_MAX_REQUESTS = 600  # 600 req/min per key


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, window_secs: int = DEFAULT_WINDOW_SECS, max_requests: int = DEFAULT_MAX_REQUESTS):
        super().__init__(app)
        self.window_secs = window_secs
        self.max_requests = max_requests

    async def dispatch(self, request: Request, call_next):
        # Only rate-limit ingestion endpoints
        if not request.url.path.startswith("/v1/"):
            return await call_next(request)

        # Skip if Redis is not connected
        if not redis_client:
            return await call_next(request)

        # Identify the caller by API key or IP fallback
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            identity = f"key:{auth[7:][:16]}"  # first 16 chars of key as bucket id
        else:
            identity = f"ip:{request.client.host}" if request.client else "ip:unknown"

        key = f"aiops:ratelimit:{identity}"
        now = time.time()
        window_start = now - self.window_secs

        try:
            pipe = redis_client.pipeline()
            # Remove entries outside the current window
            pipe.zremrangebyscore(key, 0, window_start)
            # Count remaining entries
            pipe.zcard(key)
            # Add current request
            pipe.zadd(key, {f"{now}": now})
            # Set TTL so keys auto-expire
            pipe.expire(key, self.window_secs + 10)
            results = pipe.execute()

            current_count = results[1]

            if current_count >= self.max_requests:
                retry_after = int(self.window_secs - (now - window_start))
                logger.warning("Rate limit exceeded for %s (%d/%d)", identity, current_count, self.max_requests)
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded"},
                    headers={"Retry-After": str(max(retry_after, 1))}
                )
        except Exception as e:
            # If Redis fails, allow the request through (fail-open)
            logger.warning("Rate limiter Redis error: %s — allowing request.", e)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Window"] = f"{self.window_secs}s"
        return response
