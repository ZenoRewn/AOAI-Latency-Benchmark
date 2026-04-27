"""REST + SSE API endpoints."""

import asyncio
import json
import os
import uuid
import logging
import shutil

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from auth import detect_auth_method
from benchmark.engine import BenchmarkEngine
from config import (
    MODELS, DEFAULT_API_VERSION, DEFAULT_ITERATIONS, DEFAULT_MAX_TOKENS,
    BENCHMARK_PRESETS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# In-memory storage for benchmark runs
runs: dict[str, dict] = {}


class RegionConfig(BaseModel):
    name: str
    endpoint: str


class BenchmarkConfig(BaseModel):
    regions: list[RegionConfig]
    models: list[str]
    api_types: list[str]  # ["chat"] or ["responses"] or both
    iterations: int = 3
    rounds: int = 1
    max_tokens: int = 100
    timeout: int = 30
    system_prompt: str = "You are a helpful assistant."
    user_prompt: str = "Explain the concept of cloud computing in a few sentences."
    test_cache: bool = False
    api_key: str | None = None
    api_version: str = "2025-03-01-preview"
    reasoning_efforts: list[str] = []   # ["", "low", "medium", "high"]
    reasoning_summary: str | None = None
    streaming: bool = True
    warmup: bool = True
    concurrency: int = 5
    mode: str = "benchmark"  # "benchmark" | "monitor"
    monitor_interval: int = 30  # seconds between probes
    monitor_duration: int = 600  # total monitoring duration in seconds


@router.get("/config")
async def get_config():
    return {
        "models": MODELS,
        "default_api_version": DEFAULT_API_VERSION,
        "default_iterations": DEFAULT_ITERATIONS,
        "default_max_tokens": DEFAULT_MAX_TOKENS,
        "presets": BENCHMARK_PRESETS,
    }


@router.get("/auth/status")
async def auth_status():
    return await detect_auth_method()


@router.get("/resources/discover")
async def discover_resources():
    """Discover Azure AI Services / OpenAI resources.

    Priority:
    1. azure-mgmt-cognitiveservices SDK with DefaultAzureCredential
       (works in AKS Workload Identity, Managed Identity, local az login).
    2. Fallback to `az` CLI if the SDK path fails and `az` is on PATH
       (covers dev machines without azure-mgmt-* installed).

    Returns 200 with `{resources: [...], error: ...}` so the frontend can
    show a friendly "please input manually" hint instead of erroring out.
    """
    sdk_resources, sdk_error = await _discover_via_sdk()
    if sdk_resources is not None:
        return {"resources": sdk_resources, "error": None}

    az_resources, az_error = await _discover_via_az_cli()
    if az_resources is not None:
        return {"resources": az_resources, "error": None}

    return {
        "resources": [],
        "error": (
            "Auto-discovery unavailable. "
            f"SDK: {sdk_error or 'n/a'}. CLI: {az_error or 'n/a'}. "
            "Please enter endpoint manually."
        ),
    }


async def _discover_via_sdk() -> tuple[list[dict] | None, str | None]:
    """Use azure-mgmt-cognitiveservices to list AOAI / AIServices accounts."""
    try:
        from azure.identity.aio import DefaultAzureCredential
        from azure.mgmt.resource.subscriptions.aio import SubscriptionClient
        from azure.mgmt.cognitiveservices.aio import CognitiveServicesManagementClient
    except Exception as e:
        return None, f"SDK import failed: {e}"

    try:
        credential = DefaultAzureCredential()
    except Exception as e:
        return None, f"Credential init failed: {e}"

    try:
        resources: list[dict] = []
        sub_ids = [s for s in (os.environ.get("AZURE_SUBSCRIPTION_ID") or "").split(",") if s.strip()]
        if not sub_ids:
            async with SubscriptionClient(credential) as sub_client:
                async for sub in sub_client.subscriptions.list():
                    sub_ids.append(sub.subscription_id)

        for sub_id in sub_ids:
            async with CognitiveServicesManagementClient(credential, sub_id) as cs_client:
                async for acct in cs_client.accounts.list():
                    kind = (acct.kind or "").strip()
                    if kind not in ("OpenAI", "AIServices"):
                        continue
                    endpoint = None
                    if acct.properties and getattr(acct.properties, "endpoint", None):
                        endpoint = acct.properties.endpoint
                    resources.append({
                        "name": acct.name,
                        "endpoint": endpoint,
                        "region": acct.location,
                        "kind": kind,
                        "subscription_id": sub_id,
                    })
        return resources, None
    except Exception as e:
        logger.debug(f"SDK discover failed: {e}")
        return None, str(e)
    finally:
        try:
            await credential.close()
        except Exception:
            pass


async def _discover_via_az_cli() -> tuple[list[dict] | None, str | None]:
    """Legacy fallback: shell out to `az` CLI."""
    az_path = shutil.which("az")
    if not az_path:
        return None, "az CLI not found on PATH"
    query = (
        "[?kind=='AIServices' || kind=='OpenAI']"
        ".{name:name, endpoint:properties.endpoint, region:location, kind:kind}"
    )
    try:
        proc = await asyncio.create_subprocess_exec(
            az_path, "cognitiveservices", "account", "list",
            "--query", query, "-o", "json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        return None, "az CLI timed out"
    if proc.returncode != 0:
        return None, (stderr.decode(errors="replace").strip() or "az command failed")
    try:
        return json.loads(stdout.decode()), None
    except json.JSONDecodeError:
        return None, "failed to parse az output"


@router.get("/version")
async def get_version():
    """Lightweight version / auth state endpoint for on-call and smoke tests."""
    auth_info = await detect_auth_method()
    return {
        "app": "aoai-latency-benchmark",
        "version": os.getenv("APP_VERSION", "dev"),
        "commit": os.getenv("GIT_COMMIT", "unknown"),
        "auth": auth_info,
    }


@router.post("/benchmark/start")
async def start_benchmark(config: BenchmarkConfig):
    run_id = str(uuid.uuid4())[:8]
    engine = BenchmarkEngine()
    queue: asyncio.Queue = asyncio.Queue()

    runs[run_id] = {
        "engine": engine,
        "queue": queue,
        "config": config.model_dump(),
        "status": "running",
    }

    # Start benchmark in background task
    async def run_and_queue():
        try:
            async for event in engine.run(config.model_dump()):
                await queue.put(event)
        except Exception as e:
            await queue.put({"type": "error", "message": str(e)})
        finally:
            await queue.put(None)  # sentinel
            runs[run_id]["status"] = "complete"

    asyncio.create_task(run_and_queue())

    return {"run_id": run_id}


@router.get("/benchmark/{run_id}/stream")
async def stream_benchmark(run_id: str):
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")

    queue = runs[run_id]["queue"]

    async def event_generator():
        while True:
            event = await queue.get()
            if event is None:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/benchmark/{run_id}/stop")
async def stop_benchmark(run_id: str):
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    runs[run_id]["engine"].request_stop()
    return {"status": "stopping"}


@router.get("/benchmark/{run_id}/results")
async def get_results(run_id: str):
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")

    engine = runs[run_id]["engine"]
    return {
        "status": runs[run_id]["status"],
        "results": [r.to_dict() for r in engine.results],
    }


@router.get("/benchmark/{run_id}/export/{fmt}")
async def export_results(run_id: str, fmt: str):
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")

    engine = runs[run_id]["engine"]

    if fmt == "csv":
        data = engine.export_csv()
        return Response(
            content=data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=benchmark_{run_id}.csv"},
        )
    elif fmt in ("xlsx", "excel"):
        data = engine.export_excel()
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=benchmark_{run_id}.xlsx"},
        )
    else:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'xlsx'")
