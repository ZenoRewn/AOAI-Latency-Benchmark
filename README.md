# Azure OpenAI Latency Benchmark

Cross-region performance testing tool for Azure OpenAI Service. Measure TTFT (Time To First Token), total latency, and throughput (Tokens Per Second) across multiple regions, models, and API types in one benchmark run.

## Features

- **Multi-region comparison** - Test the same model across different Azure regions to find the fastest endpoint
- **Multi-model support** - GPT-5.x, GPT-4.1, GPT-4o, o-Series, Embeddings, TTS, Whisper, DALL-E, Realtime
- **Multi-API type** - Chat Completions, Responses API, Embeddings, TTS, Whisper (STT), Image Generation, Realtime
- **Reasoning Effort matrix** - Test multiple reasoning effort levels (Low/Medium/High) in parallel to compare their impact on latency
- **Prompt caching test** - Measure cache hit rate and latency improvement
- **Multi-round testing** - Run multiple rounds to observe performance stability over time
- **Live dashboard** - Real-time progress with per-call metrics as they stream in
- **Interactive charts** - TTFT bar charts, latency comparison, TPS, percentile distributions, heatmaps, round trends (powered by Plotly)
- **Export** - Download results as CSV or Excel (with summary sheet)
- **Flexible authentication** - Azure CLI (`az login`), AKS Workload Identity, Managed Identity, environment variables, or manual API key input
- **Containerized + AKS-ready** - Multi-stage Dockerfile and Kustomize manifests in `k8s/`

## Project Structure

```
AOAI_Latency_Benchmark/
├── app.py                  # FastAPI entry point (uvicorn on port 8088)
├── config.py               # Model catalog, default parameters, constants
├── auth.py                 # Three-tier auth: az login → env var → manual key
├── requirements.txt        # Python dependencies
├── routes/
│   └── api.py              # REST + SSE API endpoints
├── benchmark/
│   ├── engine.py           # Core orchestrator: region × model × api_type × effort loop
│   ├── metrics.py          # Data models (BenchmarkResult, SingleCallMetrics, CacheTestResult)
│   ├── chat_bench.py       # Chat Completions streaming TTFT measurement
│   ├── responses_bench.py  # Responses API benchmark
│   ├── cache_test.py       # Prompt caching hit/miss comparison
│   ├── embedding_bench.py  # Embeddings latency benchmark
│   ├── audio_bench.py      # TTS & Whisper (STT) benchmark
│   ├── image_bench.py      # DALL-E image generation benchmark
│   └── realtime_bench.py   # Realtime API (WebSocket) benchmark
├── templates/
│   ├── base.html           # Base HTML template (Plotly CDN)
│   └── index.html          # Main UI: config → running → results
└── static/
    ├── css/style.css        # Styles
    └── js/app.js            # Frontend logic: SSE client, charts, table rendering
```

## Quick Start

### Prerequisites

- Python **3.10+** (the codebase uses PEP 604 `X | None` syntax; macOS's bundled `python3` is 3.9 and will fail — install `python@3.13` via Homebrew or similar)
- Node.js 20+ and npm (only for local dev with the Next.js dev server — not needed for the Docker path)
- An Azure subscription with Azure OpenAI resources deployed
- Authentication via one of:
  - **Azure CLI**: `az login` (recommended)
  - **Environment variable**: `export AZURE_OPENAI_API_KEY=your-key`
  - **Manual input**: Enter API key in the web UI

### Install & Run

Pick the path that matches your goal:

**A. Local dev with hot reload (recommended while iterating)** — runs FastAPI on `:8088` and the Next.js dev server on `:3000`. `/api/*` and `/healthz` are proxied through the frontend via `next.config.ts`, so there is **no env var to set**. The script auto-picks a Python 3.10+ interpreter, creates `.venv/`, and installs deps on first run.

```bash
./scripts/run-dev.sh              # start both (detached) + smoke test
./scripts/run-dev.sh status       # show pids / URLs
./scripts/run-dev.sh stop         # stop both
```

Open **http://localhost:3000**.

**B. One-process (FastAPI serves the prebuilt frontend)** — good for container / AKS-style smoke tests. Requires `frontend/out/` to exist (run `cd frontend && npm run build` once).

```bash
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open **http://127.0.0.1:8088**.

**C. Docker, with your `az login` mounted in** — see `./scripts/run-local.sh`.

### Usage

1. **Open the UI** at http://127.0.0.1:8088
2. **Add regions** - Use "Auto Discover" (requires `az login`) to find your Azure AI resources, or manually enter endpoint URLs
3. **Select models** - Pick one or more model deployments from the catalog, or add custom deployment names
4. **Choose API types** - Chat Completions, Responses API, Embeddings, etc.
5. **Configure parameters**:
   - **Iterations**: Number of calls per test combination (1-10)
   - **Rounds**: Repeat the full test multiple times (1-10)
   - **Max Tokens**: Output token limit (50-500)
   - **Reasoning Effort**: Select one or more levels (None/Low/Medium/High) to compare as a test dimension
   - **Reasoning Summary**: Off/Auto/Concise/Detailed
   - **Prompt Caching**: Toggle to test cache hit/miss latency
6. **Start Benchmark** - Watch real-time progress with per-call metrics
7. **View Results** - Interactive charts, sortable detail table, summary cards
8. **Export** - Download as CSV or Excel

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web UI |
| `GET` | `/healthz` | Liveness probe (always 200) |
| `GET` | `/readyz` | Readiness probe — 200 when auth is resolvable, 503 otherwise |
| `GET` | `/api/version` | App version + auth method (useful for on-call / smoke tests) |
| `GET` | `/api/auth/status` | Check authentication method (`workload_identity` \| `managed_identity` \| `azure_cli` \| `env_vars` \| …) |
| `GET` | `/api/resources/discover` | Auto-discover Azure AI resources (SDK first, falls back to `az` CLI) |
| `GET` | `/api/config` | Models, defaults, and preset benchmark profiles |
| `POST` | `/api/benchmark/start` | Start a benchmark run (returns `run_id`) |
| `GET` | `/api/benchmark/{run_id}/stream` | SSE stream of progress and results |
| `GET` | `/api/benchmark/{run_id}/results` | Get all results for a run |
| `GET` | `/api/benchmark/{run_id}/export/csv` | Export results as CSV |
| `GET` | `/api/benchmark/{run_id}/export/xlsx` | Export results as Excel |

## Benchmark Config (POST body)

```json
{
  "regions": [{"name": "eastus", "endpoint": "https://my-resource.openai.azure.com/"}],
  "models": ["gpt-5", "gpt-4.1"],
  "api_types": ["chat", "responses"],
  "iterations": 3,
  "rounds": 1,
  "max_tokens": 100,
  "timeout": 30,
  "reasoning_efforts": ["low", "medium", "high"],
  "reasoning_summary": "auto",
  "test_cache": false,
  "api_key": null,
  "api_version": "2025-03-01-preview"
}
```

## Metrics Collected

| Metric | Description |
|--------|-------------|
| TTFT (ms) | Time To First Token - time until the first streaming token arrives |
| Total Latency (ms) | End-to-end time from request to last token |
| TPS | Tokens Per Second (completion tokens / generation time) |
| Prompt Tokens | Input token count |
| Completion Tokens | Output token count |
| Cached Tokens | Tokens served from prompt cache |
| P50/P95/P99 TTFT | TTFT percentile distribution |
| Error Rate | Percentage of failed calls |
| Cache Hit Rate | Prompt caching effectiveness |

## Docker

Build a single self-contained image that bundles the FastAPI backend and the
pre-built Next.js frontend (served from `/`).

```bash
docker build -t aoai-benchmark:local .
docker run --rm -p 8088:8088 \
    -e AZURE_OPENAI_API_KEY=<optional-fallback-key> \
    aoai-benchmark:local
# open http://localhost:8088
```

### Local dev with Auto Discovery (uses your `az login`)

If you want Auto Discovery to list your own Azure OpenAI / AIServices
resources when running the container locally, use the helper script:

```bash
az login                        # once, if not already logged in
./scripts/run-local.sh          # build + run + smoke test
# open http://localhost:8088
./scripts/run-local.sh stop     # stop and clean up
```

What it does:

1. Builds the image with `--build-arg INSTALL_AZ_CLI=true` so the Azure CLI
   is present in the container. `DefaultAzureCredential`'s `AzureCliCredential`
   shells out to `az`, which only works if `az` is on PATH inside the image.
   The production build path (`build-and-deploy.sh`) omits this arg, so the
   ACR image stays slim and relies on Workload Identity instead.
2. Copies `~/.azure/` to `/tmp/aoai-azure-local/` with widened read/write
   permissions (the originals stay at `600`). The MSAL token cache is
   otherwise unreadable by the container user.
3. Runs the container with that temp dir bind-mounted at `/root/.azure`
   (and `--user 0`) so the in-container `az` can read tokens regardless of
   host-side uid mapping.
4. Waits for `/healthz`, then prints `/api/version` and
   `/api/resources/discover` so you can confirm auth flowed through.

`SKIP_BUILD=1 ./scripts/run-local.sh` skips the rebuild when you've only
changed Python/TS code and the base image is already cached.

Environment variables the container honors:

| Var | Default | Purpose |
|-----|---------|---------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8088` | Listen port |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000,http://localhost:8088,http://127.0.0.1:8088` | Comma-separated CORS origins |
| `AZURE_OPENAI_API_KEY` | *(unset)* | Optional fallback key when no MI/CLI is available |
| `AZURE_SUBSCRIPTION_ID` | *(unset)* | Restrict discovery to specific subscription(s) (comma-separated) |
| `APP_VERSION` / `GIT_COMMIT` | *(unset)* | Surfaced on `/api/version` |

Browser-side Entra ID SSO (optional) is now configured **per-user inside the
UI** — the user enters their own App Registration's client id and tenant.
No MSAL-related env vars need to be set on the server.

## Deploy to Azure AKS

The `k8s/` directory has a Kustomize-ready set of manifests. End users sign
in **with their own Entra ID App Registration** (configured from the UI —
no server-side MSAL env vars needed), or just paste an endpoint + API key
and skip sign-in entirely.

Short version:

1. Build and push the image to your registry.
2. Fill in `REPLACE_WITH_IMAGE` in `k8s/deployment.yaml` and `kubectl apply -k k8s/`.
3. Users open the site → pick one of the two auth flows below.

Full step-by-step lives in [`k8s/README.md`](k8s/README.md). How you
actually run the build/push/roll is up to your environment — CI pipeline,
GitOps, or a local script. The repo ships an optional convenience helper
at `scripts/build-and-deploy.sh` for local-machine rollouts; feel free to
ignore it if your deploy flow is elsewhere.

### Verifying after a rollout

Once the new image is live, a quick curl confirms it:

```bash
curl https://<your-host>/healthz                 # HTTP 200
curl https://<your-host>/readyz                  # HTTP 200 regardless of credential state
curl https://<your-host>/api/resources/discover  # one-line error when unauthenticated, never a JSON dump
```

### Authentication paths

Two ways a user can authenticate against their Azure OpenAI resources; both
are fully self-service inside the browser. Pick one per user — no
server-side Azure config is required.

**1. Entra ID App Registration (recommended for multi-user / team use).**
Any admin in the tenant creates a single-page App Registration once; each
user pastes its `client id` + `tenant id` into the app (stored in their
browser's `localStorage` — no secrets). Browser MSAL then signs in
silently, and the same identity is used for both Auto Discovery and
benchmark calls under the user's own RBAC.

The App Registration needs:
- Type: **Single-page application**
- Redirect URI: the benchmark's public URL (e.g. `https://aoai-benchmark.example.com`)
- Delegated permissions on **Azure Service Management** (`user_impersonation`)
  and **Azure OpenAI / Cognitive Services** (`user_impersonation`)

Users then click **Configure SSO** in the Authentication bar, paste the
two GUIDs, and sign in. The client id and tenant live only in their
browser; tokens are acquired per-audience (ARM for discovery, Cognitive
Services for benchmark calls).

**2. Paste endpoint + API key (single-use / quick tests).**
Skip sign-in entirely. In the *Manual Entry* tab of Region Configuration,
add the endpoint URL and paste the API key from Azure Portal → your AOAI
resource → Keys and Endpoint. The key is used for every manually added
region in the run.

### Backend credential fallback (local dev / pod-identity deploys)

When the browser doesn't send an `Authorization: Bearer` header (neither
SSO nor paste-key is active), the backend falls back to
`DefaultAzureCredential`. This picks up `az login` locally, or a Workload
Identity / Managed Identity if you deploy with one attached. Useful when
running the image on your own laptop via `./scripts/run-local.sh`; for
shared cluster deployments, prefer one of the two UI-driven paths above.

## License

This project is for internal benchmarking and testing purposes.
