"""Cache hit/miss comparison test."""

import logging

from openai import AsyncOpenAI

from config import CACHE_TEST_SYSTEM_PROMPT, DEFAULT_USER_PROMPT
from benchmark.metrics import CacheTestResult
from benchmark.chat_bench import run_chat_completion
from benchmark.responses_bench import run_responses_api

logger = logging.getLogger(__name__)


async def run_cache_test(
    client: AsyncOpenAI,
    deployment: str,
    api_type: str,
    max_tokens: int,
    timeout: int,
    reasoning_effort: str | None = None,
    reasoning_summary: str | None = None,
) -> CacheTestResult:
    """Run a cache test: two identical calls, compare latency and cached_tokens.

    The first call should be a cache miss; the second should be a cache hit
    (if prompt caching is supported for the model/region).
    """
    user_prompt = DEFAULT_USER_PROMPT

    if api_type == "responses":
        call1 = await run_responses_api(
            client, deployment, CACHE_TEST_SYSTEM_PROMPT,
            user_prompt, max_tokens, timeout, iteration=1,
            reasoning_effort=reasoning_effort,
            reasoning_summary=reasoning_summary,
        )
        call2 = await run_responses_api(
            client, deployment, CACHE_TEST_SYSTEM_PROMPT,
            user_prompt, max_tokens, timeout, iteration=2,
            reasoning_effort=reasoning_effort,
            reasoning_summary=reasoning_summary,
        )
    else:
        call1 = await run_chat_completion(
            client, deployment, CACHE_TEST_SYSTEM_PROMPT,
            user_prompt, max_tokens, timeout, iteration=1,
            reasoning_effort=reasoning_effort,
        )
        call2 = await run_chat_completion(
            client, deployment, CACHE_TEST_SYSTEM_PROMPT,
            user_prompt, max_tokens, timeout, iteration=2,
            reasoning_effort=reasoning_effort,
        )

    if call1.error or call2.error:
        logger.warning(f"Cache test had errors: call1={call1.error}, call2={call2.error}")
        return CacheTestResult()

    # Use call2's cached_tokens — populated via the multi-path extract_cached_tokens
    # in chat_bench / responses_bench, so stray SDK/API-version shapes don't zero it out.
    cached = call2.cached_tokens
    prompt_tokens = call2.prompt_tokens or 1
    hit_rate = round(cached / prompt_tokens, 4) if prompt_tokens > 0 else 0.0
    speedup = 0.0
    if call1.total_latency_ms > 0:
        speedup = round(
            (call1.total_latency_ms - call2.total_latency_ms) / call1.total_latency_ms * 100, 2
        )

    return CacheTestResult(
        miss_latency_ms=call1.total_latency_ms,
        hit_latency_ms=call2.total_latency_ms,
        cached_tokens=cached,
        prompt_tokens=prompt_tokens,
        hit_rate=hit_rate,
        speedup_pct=speedup,
    )
