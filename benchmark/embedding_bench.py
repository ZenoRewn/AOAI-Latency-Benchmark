"""Embeddings API latency measurement."""

import asyncio
import logging
import time

from openai import AsyncOpenAI

from auth import last_request_id
from benchmark.metrics import SingleCallMetrics
from benchmark.network_timing import get_current_timings
from benchmark.streaming import classify_error

logger = logging.getLogger(__name__)


async def run_embedding(
    client: AsyncOpenAI,
    deployment: str,
    input_text: str,
    timeout: int,
    iteration: int,
) -> SingleCallMetrics:
    metrics = SingleCallMetrics(iteration=iteration)
    try:
        t_start = time.perf_counter()
        resp = await asyncio.wait_for(
            client.embeddings.create(model=deployment, input=[input_text]),
            timeout=timeout,
        )
        metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
        metrics.prompt_tokens = getattr(resp.usage, "prompt_tokens", 0)
        metrics.request_id = last_request_id.get("")
        nt = get_current_timings()
        if nt:
            nt.compute()
            metrics.tcp_connect_ms = nt.tcp_connect_ms
            metrics.tls_ms = nt.tls_ms
    except asyncio.TimeoutError as e:
        metrics.error = "Timeout"
        metrics.error_category = classify_error(e)
        logger.warning("Embedding call timed out: %s iter=%d", deployment, iteration)
    except Exception as e:
        metrics.error = str(e)[:200]
        metrics.error_category = classify_error(e)
        logger.warning("Embedding call failed (%s): %s iter=%d: %s", metrics.error_category, deployment, iteration, e)
    return metrics
