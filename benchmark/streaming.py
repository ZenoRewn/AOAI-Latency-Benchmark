"""Shared helpers for benchmark modules.

Only pulls in truly repeated patterns:
- `classify_error`: map a raised exception to a coarse category string
  that UIs / dashboards can filter on.
- `extract_cached_tokens`: robustly read `cached_tokens` from an OpenAI
  usage object across multiple SDK/response shapes.
"""

from __future__ import annotations

import asyncio
from typing import Any


def classify_error(exc: BaseException) -> str:
    """Map any exception into one of a small, stable set of labels."""
    if isinstance(exc, asyncio.TimeoutError):
        return "timeout"

    status = None
    for attr in ("status_code", "status", "http_status"):
        status = getattr(exc, attr, None)
        if isinstance(status, int):
            break
    if not isinstance(status, int):
        resp = getattr(exc, "response", None)
        status = getattr(resp, "status_code", None) if resp is not None else None

    if isinstance(status, int):
        if status in (401, 403):
            return "auth"
        if status == 429:
            return "rate_limit"
        if status in (408, 504):
            return "timeout"
        if 500 <= status < 600:
            return "server_error"
        if 400 <= status < 500:
            return "client_error"

    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    if "timeout" in name or "timeout" in msg:
        return "timeout"
    if any(k in name for k in ("connect", "dns", "ssl", "network")):
        return "network"
    if any(k in msg for k in ("connection", "dns", "resolve", "ssl")):
        return "network"
    if "rate" in msg and "limit" in msg:
        return "rate_limit"
    if "unauthor" in msg or "forbidden" in msg or "invalid api key" in msg:
        return "auth"
    return "other"


def extract_cached_tokens(usage: Any) -> int:
    """Read `cached_tokens` from a usage object across SDK variants.

    Paths tried:
      usage.prompt_tokens_details.cached_tokens  (current Chat Completions shape)
      usage.input_tokens_details.cached_tokens   (Responses API shape)
      usage.cached_tokens                        (flattened/older shape)
      usage["prompt_tokens_details"]["cached_tokens"] (dict-like)
    """
    if usage is None:
        return 0

    def _dig(obj: Any, *path: str) -> Any:
        cur = obj
        for p in path:
            if cur is None:
                return None
            if isinstance(cur, dict):
                cur = cur.get(p)
            else:
                cur = getattr(cur, p, None)
        return cur

    for path in (
        ("prompt_tokens_details", "cached_tokens"),
        ("input_tokens_details", "cached_tokens"),
        ("cached_tokens",),
    ):
        val = _dig(usage, *path)
        if isinstance(val, int) and val > 0:
            return val
    return 0
