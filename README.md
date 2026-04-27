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

- Python 3.10+
- An Azure subscription with Azure OpenAI resources deployed
- Authentication via one of:
  - **Azure CLI**: `az login` (recommended)
  - **Environment variable**: `export AZURE_OPENAI_API_KEY=your-key`
  - **Manual input**: Enter API key in the web UI

### Install & Run

```bash
# Clone or download the project
cd AOAI_Latency_Benchmark

# Install dependencies
pip install -r requirements.txt

# Start the server
python app.py
```

The application will start at **http://127.0.0.1:8088**.

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

Environment variables the container honors:

| Var | Default | Purpose |
|-----|---------|---------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8088` | Listen port |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000,http://localhost:8088,http://127.0.0.1:8088` | Comma-separated CORS origins |
| `AZURE_OPENAI_API_KEY` | *(unset)* | Optional fallback key when no MI/CLI is available |
| `AZURE_SUBSCRIPTION_ID` | *(unset)* | Restrict discovery to specific subscription(s) (comma-separated) |
| `APP_VERSION` / `GIT_COMMIT` | *(unset)* | Surfaced on `/api/version` |

## Deploy to Azure AKS

The `k8s/` directory has a Kustomize-ready set of manifests. The key
property: users don't paste Azure credentials — the pod authenticates to
Azure OpenAI via **AKS Workload Identity**, so any user who opens the
page is effectively using a pre-authorized identity.

Short version:

1. Enable Workload Identity on the cluster (`az aks update --enable-oidc-issuer --enable-workload-identity`).
2. Build and push the image to ACR.
3. Create a UAMI, assign **Cognitive Services User** on the target AOAI resource(s).
4. Federate the UAMI to `system:serviceaccount:aoai-benchmark:aoai-benchmark-sa`.
5. Fill in `REPLACE_WITH_UAMI_CLIENT_ID` and `REPLACE_WITH_IMAGE` and `kubectl apply -k k8s/`.

Full step-by-step lives in [`k8s/README.md`](k8s/README.md).

### Why "just read my local az login" does not work in AKS

Browsers cannot read `~/.azure/` from the user's PC (sandbox), and the pod
cannot read the client's environment either. Workload Identity achieves
the same end result — zero client configuration — without relying on
cross-boundary credential sharing. If you later need per-user identity
(so usage counts against the individual user's AOAI quota), add an AAD
App Registration + MSAL.js in the browser; the hook point is marked in
`auth.py`.

## License

This project is for internal benchmarking and testing purposes.
