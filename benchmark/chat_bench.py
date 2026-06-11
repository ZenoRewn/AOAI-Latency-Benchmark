"""Chat Completions API streaming TTFT measurement."""

import time
import logging
import asyncio

from openai import AsyncOpenAI

from auth import last_request_id
from config import MAX_COMPLETION_TOKENS_MODELS
from benchmark.metrics import SingleCallMetrics
from benchmark.network_timing import get_current_timings, measure_dns
from benchmark.streaming import classify_error, extract_cached_tokens

logger = logging.getLogger(__name__)


def _needs_max_completion_tokens(model: str) -> bool:
    return any(model.startswith(prefix) for prefix in MAX_COMPLETION_TOKENS_MODELS)


async def run_chat_completion(
    client: AsyncOpenAI,
    deployment: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    timeout: int,
    iteration: int = 1,
    reasoning_effort: str | None = None,
    streaming: bool = True,
    network_baseline_ms: float = 0.0,
) -> SingleCallMetrics:
    """Run a Chat Completion call and measure TTFT (streaming) or total latency."""
    metrics = SingleCallMetrics(iteration=iteration)
    try:
        kwargs = dict(
            model=deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )

        # max_tokens vs max_completion_tokens
        if _needs_max_completion_tokens(deployment):
            kwargs["max_completion_tokens"] = max_tokens
        else:
            kwargs["max_tokens"] = max_tokens

        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort

        if streaming:
            kwargs["stream"] = True
            kwargs["stream_options"] = {"include_usage": True}

            t_start = time.perf_counter()
            stream = await asyncio.wait_for(
                client.chat.completions.create(**kwargs),
                timeout=timeout,
            )
            # create() returns when response headers arrive → TTFB
            metrics.ttfb_ms = round((time.perf_counter() - t_start) * 1000, 2)

            ttft_recorded = False
            async for chunk in stream:
                if not ttft_recorded and chunk.choices and chunk.choices[0].delta.content:
                    metrics.ttft_ms = round((time.perf_counter() - t_start) * 1000, 2)
                    ttft_recorded = True

                if chunk.usage:
                    metrics.prompt_tokens = chunk.usage.prompt_tokens
                    metrics.completion_tokens = chunk.usage.completion_tokens
                    metrics.cached_tokens = extract_cached_tokens(chunk.usage)

            metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)

            if metrics.completion_tokens > 0 and metrics.total_latency_ms > 0 and metrics.ttft_ms is not None:
                generation_time = metrics.total_latency_ms - metrics.ttft_ms
                if generation_time > 0:
                    metrics.tokens_per_second = round(
                        metrics.completion_tokens / (generation_time / 1000), 2
                    )
        else:
            # Non-streaming mode
            t_start = time.perf_counter()
            resp = await asyncio.wait_for(
                client.chat.completions.create(**kwargs),
                timeout=timeout,
            )
            metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
            metrics.ttfb_ms = metrics.total_latency_ms  # non-streaming: TTFB ≈ total

            if resp.usage:
                metrics.prompt_tokens = resp.usage.prompt_tokens
                metrics.completion_tokens = resp.usage.completion_tokens
                metrics.cached_tokens = extract_cached_tokens(resp.usage)

            if metrics.completion_tokens > 0 and metrics.total_latency_ms > 0:
                metrics.tokens_per_second = round(
                    metrics.completion_tokens / (metrics.total_latency_ms / 1000), 2
                )

        # Derived metrics
        if metrics.ttft_ms is not None and metrics.total_latency_ms > 0:
            metrics.token_gen_ms = round(max(metrics.total_latency_ms - metrics.ttft_ms, 0), 2)
        if metrics.ttfb_ms is not None and network_baseline_ms > 0:
            metrics.backend_est_ms = round(max(metrics.ttfb_ms - network_baseline_ms, 0), 2)

        metrics.request_id = last_request_id.get("")
        nt = get_current_timings()
        if nt:
            nt.compute()
            metrics.tcp_connect_ms = nt.tcp_connect_ms
            metrics.tls_ms = nt.tls_ms

    except asyncio.TimeoutError as e:
        metrics.error = f"Timeout after {timeout}s"
        metrics.error_category = classify_error(e)
        metrics.total_latency_ms = timeout * 1000
    except Exception as e:
        metrics.error = str(e)
        metrics.error_category = classify_error(e)
        logger.warning(f"Chat completion error ({metrics.error_category}): {e}")

    return metrics
