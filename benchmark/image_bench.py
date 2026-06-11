"""DALL-E image generation latency measurement."""

import asyncio
import logging
import time

from openai import AsyncOpenAI

from auth import last_request_id
from benchmark.metrics import SingleCallMetrics
from benchmark.network_timing import get_current_timings
from benchmark.streaming import classify_error

logger = logging.getLogger(__name__)


async def run_image_generation(
    client: AsyncOpenAI,
    deployment: str,
    prompt: str,
    size: str,
    timeout: int,
    iteration: int,
) -> SingleCallMetrics:
    metrics = SingleCallMetrics(iteration=iteration)
    try:
        t_start = time.perf_counter()
        await asyncio.wait_for(
            client.images.generate(model=deployment, prompt=prompt, n=1, size=size),
            timeout=timeout,
        )
        metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
        metrics.request_id = last_request_id.get("")
        nt = get_current_timings()
        if nt:
            nt.compute()
            metrics.tcp_connect_ms = nt.tcp_connect_ms
            metrics.tls_ms = nt.tls_ms
    except asyncio.TimeoutError as e:
        metrics.error = "Timeout"
        metrics.error_category = classify_error(e)
        logger.warning("Image gen timed out: %s iter=%d", deployment, iteration)
    except Exception as e:
        metrics.error = str(e)[:200]
        metrics.error_category = classify_error(e)
        logger.warning("Image gen failed (%s): %s iter=%d: %s", metrics.error_category, deployment, iteration, e)
    return metrics
