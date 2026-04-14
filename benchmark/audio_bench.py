"""TTS and Whisper (STT) latency measurement."""

import asyncio
import io
import logging
import time

from openai import AsyncAzureOpenAI

from auth import last_request_id
from benchmark.metrics import SingleCallMetrics
from benchmark.network_timing import get_current_timings

logger = logging.getLogger(__name__)


async def run_tts(
    client: AsyncAzureOpenAI,
    deployment: str,
    input_text: str,
    voice: str,
    timeout: int,
    iteration: int,
) -> SingleCallMetrics:
    metrics = SingleCallMetrics(iteration=iteration)
    try:
        t_start = time.perf_counter()
        resp = await asyncio.wait_for(
            client.audio.speech.create(
                model=deployment, voice=voice, input=input_text
            ),
            timeout=timeout,
        )
        # Read the full audio response
        await resp.aread()
        metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
        metrics.request_id = last_request_id.get("")
        nt = get_current_timings()
        if nt:
            nt.compute()
            metrics.tcp_connect_ms = nt.tcp_connect_ms
            metrics.tls_ms = nt.tls_ms
    except asyncio.TimeoutError:
        metrics.error = "Timeout"
        logger.warning("TTS call timed out: %s iter=%d", deployment, iteration)
    except Exception as e:
        metrics.error = str(e)[:200]
        logger.warning("TTS call failed: %s iter=%d: %s", deployment, iteration, e)
    return metrics


async def run_whisper(
    client: AsyncAzureOpenAI,
    deployment: str,
    audio_bytes: bytes,
    timeout: int,
    iteration: int,
) -> SingleCallMetrics:
    metrics = SingleCallMetrics(iteration=iteration)
    try:
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "test.wav"
        t_start = time.perf_counter()
        await asyncio.wait_for(
            client.audio.transcriptions.create(model=deployment, file=audio_file),
            timeout=timeout,
        )
        metrics.total_latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
        metrics.request_id = last_request_id.get("")
        nt = get_current_timings()
        if nt:
            nt.compute()
            metrics.tcp_connect_ms = nt.tcp_connect_ms
            metrics.tls_ms = nt.tls_ms
    except asyncio.TimeoutError:
        metrics.error = "Timeout"
        logger.warning("Whisper call timed out: %s iter=%d", deployment, iteration)
    except Exception as e:
        metrics.error = str(e)[:200]
        logger.warning("Whisper call failed: %s iter=%d: %s", deployment, iteration, e)
    return metrics
