"""BenchmarkEngine: orchestrates tests across regions × models × API types."""

import asyncio
import io
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

import pandas as pd
from openai import AsyncAzureOpenAI

from urllib.parse import urlparse

from auth import get_client
from config import (
    DEFAULT_EMBEDDING_INPUT, DEFAULT_TTS_INPUT, DEFAULT_TTS_VOICE,
    DEFAULT_IMAGE_PROMPT, DEFAULT_IMAGE_SIZE, WHISPER_TEST_AUDIO,
)
from benchmark.metrics import BenchmarkResult
from benchmark.network_timing import probe_network_baseline
from benchmark.chat_bench import run_chat_completion
from benchmark.responses_bench import run_responses_api
from benchmark.cache_test import run_cache_test
from benchmark.embedding_bench import run_embedding
from benchmark.audio_bench import run_tts, run_whisper
from benchmark.image_bench import run_image_generation
from benchmark.realtime_bench import run_realtime

logger = logging.getLogger(__name__)


class BenchmarkEngine:
    def __init__(self):
        self.results: list[BenchmarkResult] = []
        self.is_running = False
        self.is_complete = False
        self._stop_requested = False

    def request_stop(self):
        self._stop_requested = True

    async def run(self, config: dict) -> AsyncGenerator[dict, None]:
        """Run benchmarks and yield progress events.

        config keys:
            regions: list of {"name": str, "endpoint": str}
            models: list of str (deployment names)
            api_types: list of "chat"|"responses"|"embeddings"|"tts"|"whisper"|"image"|"realtime"
            iterations: int
            rounds: int
            max_tokens: int
            timeout: int
            system_prompt: str
            user_prompt: str
            test_cache: bool
            api_key: str | None
            api_version: str
            reasoning_efforts: list of str (e.g. ["", "low", "medium", "high"])
            reasoning_summary: str | None
        """
        self.is_running = True
        self._stop_requested = False
        self.results = []

        mode = config.get("mode", "benchmark")
        if mode == "monitor":
            async for event in self._run_monitor(config):
                yield event
            return

        regions = config["regions"]
        models = config["models"]
        api_types = config["api_types"]
        iterations = config.get("iterations", 3)
        rounds = config.get("rounds", 1)
        max_tokens = config.get("max_tokens", 100)
        timeout = config.get("timeout", 30)
        system_prompt = config.get("system_prompt", "You are a helpful assistant.")
        user_prompt = config.get("user_prompt", "Say hello.")
        test_cache = config.get("test_cache", False)
        api_key = config.get("api_key")
        api_version = config.get("api_version", "2025-03-01-preview")
        reasoning_efforts = config.get("reasoning_efforts", [])
        reasoning_summary = config.get("reasoning_summary")
        streaming = config.get("streaming", True)
        warmup = config.get("warmup", True)
        concurrency = config.get("concurrency", 5)

        # API types that support reasoning_effort
        reasoning_api_types = {"chat", "responses"}

        # Calculate total tasks and calls accounting for reasoning_effort dimension
        total_tasks = 0
        total_calls = 0
        for at in api_types:
            efforts = reasoning_efforts if (reasoning_efforts and at in reasoning_api_types) else [""]
            total_tasks += len(regions) * len(models) * len(efforts)
            total_calls += len(regions) * len(models) * len(efforts) * iterations
        total_calls *= rounds
        total_tasks *= rounds
        if test_cache:
            for at in api_types:
                if at in ("chat", "responses"):
                    efforts = reasoning_efforts if (reasoning_efforts and at in reasoning_api_types) else [""]
                    total_calls += len(regions) * len(models) * len(efforts) * rounds
        current = 0

        yield {"type": "started", "total_tasks": total_tasks, "total_calls": total_calls}

        cache_api_types = {"chat", "responses"}

        # Warm-up phase: one non-measured call per region/model/api_type combo
        if warmup:
            for region_info in regions:
                region_name = region_info["name"]
                endpoint = region_info["endpoint"]
                needs_client = any(at != "realtime" for at in api_types)
                warmup_client = None
                if needs_client:
                    try:
                        warmup_client = await get_client(endpoint, api_version, api_key)
                    except Exception:
                        continue
                for model in models:
                    for api_type in api_types:
                        yield {
                            "type": "warmup",
                            "message": f"Warming up {model} in {region_name} ({api_type})",
                        }
                        try:
                            await self._run_single_call(
                                api_type, warmup_client, model, endpoint,
                                system_prompt, user_prompt, max_tokens, timeout,
                                api_key, api_version, 0,
                            )
                        except Exception:
                            pass
                if warmup_client:
                    try:
                        await warmup_client.close()
                    except Exception:
                        pass

        semaphore = asyncio.Semaphore(concurrency)
        network_baselines: dict[str, float] = {}

        for round_num in range(1, rounds + 1):
            round_prefix = f"Round {round_num}/{rounds}: " if rounds > 1 else ""

            for region_info in regions:
                region_name = region_info["name"]
                endpoint = region_info["endpoint"]

                # Network probe (once per region on first round)
                if region_name not in network_baselines:
                    try:
                        host = urlparse(endpoint).hostname
                        probe = await probe_network_baseline(host)
                        network_baselines[region_name] = probe.total_ms
                        yield {"type": "probe", "region": region_name, "probe": probe.to_dict()}
                    except Exception:
                        network_baselines[region_name] = 0.0

                net_baseline = network_baselines.get(region_name, 0.0)

                needs_client = any(at != "realtime" for at in api_types)
                client = None
                if needs_client:
                    try:
                        client = await get_client(endpoint, api_version, api_key)
                    except Exception as e:
                        yield {
                            "type": "error",
                            "message": f"Auth failed for {region_name}: {e}",
                            "region": region_name,
                        }
                        skip = 0
                        for at in api_types:
                            eff = reasoning_efforts if (reasoning_efforts and at in reasoning_api_types) else [""]
                            skip += len(models) * len(eff) * iterations
                        current += skip
                        continue

                for model in models:
                    # Flatten all (api_type, effort, iteration) into one task list
                    all_tasks = []
                    task_keys = []  # (api_type, effort, iteration_num)

                    for api_type in api_types:
                        efforts = reasoning_efforts if (reasoning_efforts and api_type in reasoning_api_types) else [""]
                        for effort in efforts:
                            effort_val = effort if effort else None
                            for i in range(1, iterations + 1):
                                all_tasks.append(
                                    self._guarded_call(
                                        semaphore, api_type, client, model, endpoint,
                                        system_prompt, user_prompt, max_tokens, timeout,
                                        api_key, api_version, i,
                                        effort_val, reasoning_summary, streaming,
                                        net_baseline,
                                    )
                                )
                                task_keys.append((api_type, effort, i))

                    yield {
                        "type": "progress",
                        "current": current,
                        "total": total_calls,
                        "message": f"{round_prefix}Testing {model} in {region_name} ({len(all_tasks)} calls, concurrency={concurrency})",
                    }

                    # Run ALL tasks concurrently (semaphore limits actual parallelism)
                    all_results_list = await asyncio.gather(*all_tasks)
                    current += len(all_tasks)

                    # Group results by (api_type, effort) and build BenchmarkResult objects
                    grouped: dict[tuple, list] = {}
                    for idx, call_metrics in enumerate(all_results_list):
                        api_type, effort, iter_num = task_keys[idx]
                        key = (api_type, effort)
                        if key not in grouped:
                            grouped[key] = []
                        grouped[key].append((iter_num, call_metrics))

                        # Emit live call_result event
                        yield {
                            "type": "call_result",
                            "current": current,
                            "total": total_calls,
                            "region": region_name,
                            "model": model,
                            "api_type": api_type,
                            "reasoning_effort": effort,
                            "iteration": iter_num,
                            "round": round_num,
                            "metrics": call_metrics.to_dict(),
                        }

                    for (api_type, effort), calls_list in grouped.items():
                        result = BenchmarkResult(
                            region=region_name,
                            endpoint=endpoint,
                            model=model,
                            api_type=api_type,
                            reasoning_effort=effort,
                            round=round_num,
                            timestamp=datetime.now(timezone.utc).isoformat(),
                            network_probe_ms=net_baseline,
                        )
                        for _, call_metrics in sorted(calls_list, key=lambda x: x[0]):
                            result.calls.append(call_metrics)

                        # Cache test — only for chat/responses
                        if test_cache and api_type in cache_api_types:
                            effort_val = effort if effort else None
                            current += 1
                            cache_result = await run_cache_test(
                                client, model, api_type, max_tokens, timeout,
                                reasoning_effort=effort_val,
                                reasoning_summary=reasoning_summary,
                            )
                            result.cache = cache_result

                        result.compute_aggregates()
                        self.results.append(result)

                        yield {
                            "type": "result",
                            "data": result.to_dict(),
                        }

                if client:
                    try:
                        await client.close()
                    except Exception:
                        pass

        self.is_running = False
        self.is_complete = True
        yield {
            "type": "complete",
            "total_results": len(self.results),
            "message": "Benchmark complete",
        }

    async def _run_monitor(self, config: dict) -> AsyncGenerator[dict, None]:
        """Continuous monitoring mode: probe at intervals for a duration."""
        regions = config["regions"]
        models = config["models"]
        api_types = config["api_types"]
        max_tokens = config.get("max_tokens", 100)
        timeout = config.get("timeout", 30)
        system_prompt = config.get("system_prompt", "You are a helpful assistant.")
        user_prompt = config.get("user_prompt", "Say hello.")
        api_key = config.get("api_key")
        api_version = config.get("api_version", "2025-03-01-preview")
        reasoning_efforts = config.get("reasoning_efforts", [])
        reasoning_summary = config.get("reasoning_summary")
        streaming = config.get("streaming", True)
        interval = config.get("monitor_interval", 30)
        duration = config.get("monitor_duration", 600)
        reasoning_api_types = {"chat", "responses"}

        yield {"type": "started", "total_tasks": 0, "total_calls": 0, "mode": "monitor", "duration": duration}

        # Create clients
        clients = {}
        for region_info in regions:
            rn = region_info["name"]
            ep = region_info["endpoint"]
            try:
                clients[rn] = (await get_client(ep, api_version, api_key), ep)
            except Exception as e:
                yield {"type": "error", "message": f"Auth failed for {rn}: {e}", "region": rn}

        t_start = asyncio.get_event_loop().time()
        probe_num = 0

        while not self._stop_requested:
            elapsed = asyncio.get_event_loop().time() - t_start
            if elapsed >= duration:
                break

            probe_num += 1
            remaining = max(0, duration - elapsed)
            yield {
                "type": "progress",
                "current": int(elapsed),
                "total": duration,
                "message": f"Probe #{probe_num} ({int(remaining)}s remaining)",
            }

            for rn, (client, endpoint) in clients.items():
                for model in models:
                    for api_type in api_types:
                        efforts = reasoning_efforts if (reasoning_efforts and api_type in reasoning_api_types) else [""]
                        for effort in efforts:
                            effort_val = effort if effort else None
                            result = BenchmarkResult(
                                region=rn, endpoint=endpoint, model=model,
                                api_type=api_type, reasoning_effort=effort,
                                round=probe_num,
                                timestamp=datetime.now(timezone.utc).isoformat(),
                            )
                            call_metrics = await self._run_single_call(
                                api_type, client, model, endpoint,
                                system_prompt, user_prompt, max_tokens, timeout,
                                api_key, api_version, 1,
                                effort_val, reasoning_summary, streaming, 0.0,
                            )
                            result.calls.append(call_metrics)
                            result.compute_aggregates()
                            self.results.append(result)

                            yield {
                                "type": "monitor_point",
                                "timestamp": result.timestamp,
                                "region": rn,
                                "model": model,
                                "api_type": api_type,
                                "reasoning_effort": effort,
                                "probe": probe_num,
                                "metrics": call_metrics.to_dict(),
                            }

                            if self._stop_requested:
                                break
                        if self._stop_requested:
                            break
                    if self._stop_requested:
                        break
                if self._stop_requested:
                    break

            if not self._stop_requested:
                try:
                    await asyncio.wait_for(
                        asyncio.shield(self._wait_for_stop(interval)),
                        timeout=interval,
                    )
                except asyncio.TimeoutError:
                    pass

        # Cleanup
        for rn, (client, _) in clients.items():
            try:
                await client.close()
            except Exception:
                pass

        self.is_running = False
        self.is_complete = True
        yield {
            "type": "complete",
            "total_results": len(self.results),
            "message": f"Monitoring complete ({probe_num} probes)",
        }

    async def _wait_for_stop(self, max_wait: float):
        """Sleep in small increments, checking stop flag."""
        elapsed = 0.0
        while elapsed < max_wait and not self._stop_requested:
            await asyncio.sleep(0.5)
            elapsed += 0.5

    async def _guarded_call(self, semaphore, *args, **kwargs):
        """Semaphore-guarded wrapper for _run_single_call."""
        async with semaphore:
            return await self._run_single_call(*args, **kwargs)

    async def _run_single_call(
        self, api_type, client, model, endpoint,
        system_prompt, user_prompt, max_tokens, timeout,
        api_key, api_version, iteration,
        reasoning_effort=None, reasoning_summary=None,
        streaming=True, network_baseline_ms=0.0,
    ):
        if api_type == "responses":
            return await run_responses_api(
                client, model, system_prompt,
                user_prompt, max_tokens, timeout, iteration=iteration,
                reasoning_effort=reasoning_effort,
                reasoning_summary=reasoning_summary,
                streaming=streaming,
                network_baseline_ms=network_baseline_ms,
            )
        elif api_type == "embeddings":
            return await run_embedding(
                client, model, DEFAULT_EMBEDDING_INPUT, timeout, iteration=iteration,
            )
        elif api_type == "tts":
            return await run_tts(
                client, model, DEFAULT_TTS_INPUT, DEFAULT_TTS_VOICE,
                timeout, iteration=iteration,
            )
        elif api_type == "whisper":
            return await run_whisper(
                client, model, WHISPER_TEST_AUDIO, timeout, iteration=iteration,
            )
        elif api_type == "image":
            return await run_image_generation(
                client, model, DEFAULT_IMAGE_PROMPT, DEFAULT_IMAGE_SIZE,
                timeout, iteration=iteration,
            )
        elif api_type == "realtime":
            return await run_realtime(
                endpoint, model, api_key, api_version,
                timeout, iteration=iteration,
            )
        else:  # "chat" default
            return await run_chat_completion(
                client, model, system_prompt,
                user_prompt, max_tokens, timeout, iteration=iteration,
                reasoning_effort=reasoning_effort,
                streaming=streaming,
                network_baseline_ms=network_baseline_ms,
            )

    def to_dataframe(self) -> pd.DataFrame:
        rows = []
        for r in self.results:
            base = {
                "region": r.region,
                "endpoint": r.endpoint,
                "model": r.model,
                "api_type": r.api_type,
                "reasoning_effort": r.reasoning_effort,
                "round": r.round,
                "timestamp": r.timestamp,
                "avg_ttft_ms": r.avg_ttft_ms,
                "p50_ttft_ms": r.p50_ttft_ms,
                "p95_ttft_ms": r.p95_ttft_ms,
                "p99_ttft_ms": r.p99_ttft_ms,
                "avg_latency_ms": r.avg_latency_ms,
                "avg_tps": r.avg_tps,
                "error_rate": r.error_rate,
                "std_ttft_ms": r.std_ttft_ms,
                "min_ttft_ms": r.min_ttft_ms,
                "max_ttft_ms": r.max_ttft_ms,
                "std_latency_ms": r.std_latency_ms,
                "min_latency_ms": r.min_latency_ms,
                "max_latency_ms": r.max_latency_ms,
                "avg_dns_ms": r.avg_dns_ms,
                "avg_tcp_connect_ms": r.avg_tcp_connect_ms,
                "avg_tls_ms": r.avg_tls_ms,
                "avg_ttfb_ms": r.avg_ttfb_ms,
                "avg_token_gen_ms": r.avg_token_gen_ms,
                "avg_backend_est_ms": r.avg_backend_est_ms,
                "network_probe_ms": r.network_probe_ms,
            }
            if r.cache:
                base["cache_miss_latency_ms"] = r.cache.miss_latency_ms
                base["cache_hit_latency_ms"] = r.cache.hit_latency_ms
                base["cache_hit_rate"] = r.cache.hit_rate
                base["cache_speedup_pct"] = r.cache.speedup_pct

            for c in r.calls:
                row = {**base}
                row["iteration"] = c.iteration
                row["ttft_ms"] = c.ttft_ms
                row["total_latency_ms"] = c.total_latency_ms
                row["prompt_tokens"] = c.prompt_tokens
                row["completion_tokens"] = c.completion_tokens
                row["cached_tokens"] = c.cached_tokens
                row["tokens_per_second"] = c.tokens_per_second
                row["request_id"] = c.request_id
                row["ttfb_ms"] = c.ttfb_ms
                row["token_gen_ms"] = c.token_gen_ms
                row["backend_est_ms"] = c.backend_est_ms
                row["call_error"] = c.error
                rows.append(row)

        return pd.DataFrame(rows) if rows else pd.DataFrame()

    def export_csv(self) -> bytes:
        df = self.to_dataframe()
        return df.to_csv(index=False).encode("utf-8")

    def export_excel(self) -> bytes:
        df = self.to_dataframe()
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Benchmark Results")
            if not df.empty:
                summary = (
                    df.groupby(["region", "model", "api_type", "reasoning_effort", "round"])
                    .agg(
                        avg_ttft=("ttft_ms", "mean"),
                        p50_ttft=("ttft_ms", "median"),
                        avg_latency=("total_latency_ms", "mean"),
                        avg_tps=("tokens_per_second", "mean"),
                    )
                    .round(2)
                    .reset_index()
                )
                summary.to_excel(writer, index=False, sheet_name="Summary")
        return buf.getvalue()
