"""Realtime API (WebSocket) latency measurement."""

import asyncio
import json
import logging
import time

from benchmark.metrics import SingleCallMetrics
from benchmark.streaming import classify_error

logger = logging.getLogger(__name__)


async def run_realtime(
    endpoint: str,
    deployment: str,
    api_key: str | None,
    api_version: str,
    timeout: int,
    iteration: int,
    aad_token: str | None = None,
) -> SingleCallMetrics:
    """Measure Realtime API connection time and TTFT via WebSocket.

    Connects to wss://{host}/openai/realtime, sends a minimal text prompt,
    and records how long until the first response delta arrives.
    """
    try:
        import websockets
    except ImportError:
        metrics = SingleCallMetrics(iteration=iteration)
        metrics.error = "websockets package not installed"
        metrics.error_category = "other"
        return metrics

    metrics = SingleCallMetrics(iteration=iteration)

    # Build WebSocket URL
    host = endpoint.rstrip("/").replace("https://", "").replace("http://", "")
    ws_url = f"wss://{host}/openai/realtime?api-version={api_version}&deployment={deployment}"

    headers = {}
    if aad_token:
        # Per-user AAD token from the browser MSAL flow
        headers["Authorization"] = f"Bearer {aad_token}"
    elif api_key:
        headers["api-key"] = api_key
    else:
        # Fall back to pod identity / az login via DefaultAzureCredential.
        # Skip WorkloadIdentity/ManagedIdentity when AZURE_CLIENT_ID is
        # clearly a placeholder (same guard as auth.py).
        try:
            from azure.identity import DefaultAzureCredential
            from auth import make_default_credential_kwargs
            credential = DefaultAzureCredential(**make_default_credential_kwargs())
            token = credential.get_token("https://cognitiveservices.azure.com/.default")
            headers["Authorization"] = f"Bearer {token.token}"
        except Exception as e:
            metrics.error = f"Auth failed: {e}"
            metrics.error_category = "auth"
            return metrics

    try:
        t_connect_start = time.perf_counter()

        async with asyncio.timeout(timeout):
            async with websockets.connect(ws_url, additional_headers=headers) as ws:
                connection_time_ms = (time.perf_counter() - t_connect_start) * 1000

                # Send session.update
                await ws.send(json.dumps({
                    "type": "session.update",
                    "session": {
                        "modalities": ["text"],
                        "instructions": "You are a helpful assistant. Be brief.",
                    },
                }))

                # Send conversation item
                await ws.send(json.dumps({
                    "type": "conversation.item.create",
                    "item": {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": "Say hello briefly."}],
                    },
                }))

                # Request response
                await ws.send(json.dumps({"type": "response.create"}))

                # Wait for first text delta
                t_request = time.perf_counter()
                ttft_recorded = False

                while True:
                    raw = await ws.recv()
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")

                    if not ttft_recorded and msg_type in (
                        "response.text.delta",
                        "response.audio.delta",
                        "response.audio_transcript.delta",
                    ):
                        metrics.ttft_ms = round((time.perf_counter() - t_request) * 1000, 2)
                        ttft_recorded = True

                    if msg_type == "response.done":
                        metrics.total_latency_ms = round(
                            (time.perf_counter() - t_connect_start) * 1000, 2
                        )
                        break

                    if msg_type == "error":
                        metrics.error = msg.get("error", {}).get("message", "Unknown error")[:200]
                        break

    except asyncio.TimeoutError as e:
        metrics.error = "Timeout"
        metrics.error_category = classify_error(e)
        logger.warning("Realtime call timed out: %s iter=%d", deployment, iteration)
    except Exception as e:
        metrics.error = str(e)[:200]
        metrics.error_category = classify_error(e)
        logger.warning("Realtime call failed (%s): %s iter=%d: %s", metrics.error_category, deployment, iteration, e)

    return metrics
