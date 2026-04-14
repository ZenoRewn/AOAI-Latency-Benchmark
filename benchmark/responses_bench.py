"""Responses API streaming TTFT measurement."""

import time
import logging
import asyncio

from openai import AsyncAzureOpenAI

from auth import last_request_id
from benchmark.metrics import SingleCallMetrics
from benchmark.network_timing import get_current_timings

logger = logging.getLogger(__name__)


async def run_responses_api(
    client: AsyncAzureOpenAI,
    model: str,
    instructions: str,
    input_text: str,
    max_tokens: int,
    timeout: int,
    iteration: int = 1,
    reasoning_effort: str | None = None,
    reasoning_summary: str | None = None,
    streaming: bool = True,
    network_baseline_ms: float = 0.0,
) -> SingleCallMetrics:
    """Run a Responses API call and measure TTFT (streaming) or total latency."""
    metrics = SingleCallMetrics(iteration=iteration)
    try:
        kwargs = dict(
            model=model,
            instructions=instructions,
            input=input_text,
            max_output_tokens=max_tokens,
        )

        if reasoning_effort or reasoning_summary:
            reasoning = {}
            if reasoning_effort:
                reasoning["effort"] = reasoning_effort
            if reasoning_summary:
                reasoning["summary"] = reasoning_summary
            kwargs["reasoning"] = reasoning

        if streaming:
            kwargs["stream"] = True

            t_start = time.perf_counter()
            stream = await asyncio.wait_for(
                client.responses.create(**kwargs),
                timeout=timeout,
            )
            metrics.ttfb_ms = round((time.perf_counter() - t_start) * 1000, 2)

            ttft_recorded = False
            async for event in stream:
                if not ttft_recorded and event.type == "response.output_text.delta":
                    metrics.ttft_ms = round((time.perf_counter() - t_start) * 1000, 2)
                    ttft_recorded = True

                if event.type == "response.completed":
                    response = event.response
                    if hasattr(response, "usage") and response.usage:
                        metrics.prompt_tokens = getattr(response.usage, "input_tokens", 0) or 0
                        metrics.completion_tokens = getattr(response.usage, "output_tokens", 0) or 0
                        input_details = getattr(response.usage, "input_tokens_details", None)
                        if input_details:
                            metrics.cached_tokens = getattr(input_details, "cached_tokens", 0) or 0

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
                client.responses.create(**kwargs),
                timeout=timeout,
            )
            metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
            metrics.ttfb_ms = metrics.total_latency_ms

            if hasattr(resp, "usage") and resp.usage:
                metrics.prompt_tokens = getattr(resp.usage, "input_tokens", 0) or 0
                metrics.completion_tokens = getattr(resp.usage, "output_tokens", 0) or 0
                input_details = getattr(resp.usage, "input_tokens_details", None)
                if input_details:
                    metrics.cached_tokens = getattr(input_details, "cached_tokens", 0) or 0

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

    except asyncio.TimeoutError:
        metrics.error = f"Timeout after {timeout}s"
        metrics.total_latency_ms = timeout * 1000
    except Exception as e:
        metrics.error = str(e)
        logger.warning(f"Responses API error: {e}")

    return metrics
