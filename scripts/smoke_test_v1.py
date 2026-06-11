"""Smoke-test every Azure OpenAI api_type against a single resource.

Designed to verify v1 API surface viability after migration. Pass each
api_type's deployment name via its corresponding --<api_type> flag; tests
without a flag are skipped.

Example:
    python scripts/smoke_test_v1.py \\
        --endpoint https://my-aoai.openai.azure.com \\
        --api-key "$AZURE_OPENAI_API_KEY" \\
        --chat gpt-4.1-mini \\
        --responses gpt-5-mini \\
        --embeddings text-embedding-3-small \\
        --image gpt-image-1 \\
        --tts tts \\
        --whisper whisper \\
        --realtime gpt-realtime

Exit code 0 = all configured tests passed. 1 = at least one failed.
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

# Allow running from anywhere — add repo root to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from auth import get_client
from benchmark.chat_bench import run_chat_completion
from benchmark.responses_bench import run_responses_api
from benchmark.embedding_bench import run_embedding
from benchmark.audio_bench import run_tts, run_whisper
from benchmark.image_bench import run_image_generation
from benchmark.realtime_bench import run_realtime
from config import (
    DEFAULT_EMBEDDING_INPUT, DEFAULT_TTS_INPUT, DEFAULT_TTS_VOICE,
    DEFAULT_IMAGE_PROMPT, DEFAULT_IMAGE_SIZE, WHISPER_TEST_AUDIO,
)


ROW = "{:<14} {:<32} {:<6} {:>10}  {}"


async def run_one(
    api_type: str,
    deployment: str,
    endpoint: str,
    api_key: str | None,
    surface: str,
    api_version: str,
    timeout: int,
) -> tuple[bool, float, str]:
    """Run one api_type smoke test. Returns (passed, latency_ms, error)."""
    # realtime path doesn't use the shared client; everything else does.
    client = None
    try:
        if api_type != "realtime":
            client = await get_client(
                endpoint, api_version, api_key,
                aad_token=None, api_surface=surface,
            )

        if api_type == "chat":
            m = await run_chat_completion(
                client, deployment,
                "You are a helpful assistant.",
                "Say hello in five words.",
                max_tokens=32, timeout=timeout, iteration=1,
                streaming=True,
            )
        elif api_type == "chat-nostream":
            m = await run_chat_completion(
                client, deployment,
                "You are a helpful assistant.",
                "Say hello in five words.",
                max_tokens=32, timeout=timeout, iteration=1,
                streaming=False,
            )
        elif api_type == "responses":
            m = await run_responses_api(
                client, deployment,
                "You are a helpful assistant.",
                "Say hello in five words.",
                max_tokens=32, timeout=timeout, iteration=1,
                streaming=True,
            )
        elif api_type == "embeddings":
            m = await run_embedding(
                client, deployment, DEFAULT_EMBEDDING_INPUT,
                timeout=timeout, iteration=1,
            )
        elif api_type == "tts":
            m = await run_tts(
                client, deployment, DEFAULT_TTS_INPUT, DEFAULT_TTS_VOICE,
                timeout=timeout, iteration=1,
            )
        elif api_type == "whisper":
            m = await run_whisper(
                client, deployment, WHISPER_TEST_AUDIO,
                timeout=timeout, iteration=1,
            )
        elif api_type == "image":
            m = await run_image_generation(
                client, deployment, DEFAULT_IMAGE_PROMPT, DEFAULT_IMAGE_SIZE,
                timeout=timeout, iteration=1,
            )
        elif api_type == "realtime":
            m = await run_realtime(
                endpoint, deployment, api_key, api_version,
                timeout=timeout, iteration=1,
                api_surface=surface,
            )
        else:
            return False, 0.0, f"unknown api_type: {api_type}"

        if m.error:
            return False, m.total_latency_ms, m.error[:160]
        return True, m.total_latency_ms, ""
    except Exception as e:
        return False, 0.0, f"{type(e).__name__}: {str(e)[:160]}"
    finally:
        if client is not None:
            try:
                await client.close()
            except Exception:
                pass


async def amain(args: argparse.Namespace) -> int:
    surface = args.surface
    api_version = args.api_version
    timeout = args.timeout

    targets: list[tuple[str, str]] = []
    if args.chat:
        targets.append(("chat", args.chat))
        targets.append(("chat-nostream", args.chat))
    if args.responses:
        targets.append(("responses", args.responses))
    if args.embeddings:
        targets.append(("embeddings", args.embeddings))
    if args.image:
        targets.append(("image", args.image))
    if args.tts:
        targets.append(("tts", args.tts))
    if args.whisper:
        targets.append(("whisper", args.whisper))
    if args.realtime:
        targets.append(("realtime", args.realtime))

    if not targets:
        print("error: no --<api_type> deployment flags supplied; nothing to test.", file=sys.stderr)
        return 2

    print(f"endpoint = {args.endpoint}")
    print(f"surface  = {surface}" + ("" if surface == "v1" else f"   api_version = {api_version}"))
    print()
    print(ROW.format("api_type", "deployment", "result", "latency_ms", "error"))
    print("-" * 90)

    failures = 0
    for api_type, deployment in targets:
        t0 = time.perf_counter()
        ok, latency_ms, err = await run_one(
            api_type, deployment, args.endpoint,
            args.api_key, surface, api_version, timeout,
        )
        if not ok and latency_ms == 0:
            latency_ms = (time.perf_counter() - t0) * 1000
        result = "PASS" if ok else "FAIL"
        if not ok:
            failures += 1
        print(ROW.format(
            api_type, deployment[:32], result,
            f"{latency_ms:>10.1f}",
            err,
        ))

    print()
    if failures:
        print(f"{failures}/{len(targets)} FAILED")
        return 1
    print(f"all {len(targets)} PASSED")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--endpoint", required=True, help="https://<resource>.openai.azure.com")
    p.add_argument("--api-key", default=os.environ.get("AZURE_OPENAI_API_KEY"),
                   help="API key (default: $AZURE_OPENAI_API_KEY)")
    p.add_argument("--surface", choices=["v1", "preview"], default="v1",
                   help="API surface to test (default: v1)")
    p.add_argument("--api-version", default="2025-04-01-preview",
                   help="api-version when --surface=preview (default: 2025-04-01-preview)")
    p.add_argument("--timeout", type=int, default=60, help="per-call timeout seconds (default: 60)")
    p.add_argument("--chat", help="deployment name to test against chat completions (stream + non-stream)")
    p.add_argument("--responses", help="deployment name for Responses API")
    p.add_argument("--embeddings", help="deployment name for embeddings")
    p.add_argument("--image", help="deployment name for image generation")
    p.add_argument("--tts", help="deployment name for audio.speech (TTS)")
    p.add_argument("--whisper", help="deployment name for whisper transcription")
    p.add_argument("--realtime", help="deployment name for Realtime API (WebSocket)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if not args.api_key:
        print(
            "warning: no --api-key and no AZURE_OPENAI_API_KEY in env — "
            "will fall back to DefaultAzureCredential (az login / Workload Identity)",
            file=sys.stderr,
        )
    sys.exit(asyncio.run(amain(args)))
