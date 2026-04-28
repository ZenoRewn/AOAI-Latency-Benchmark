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
| `AAD_CLIENT_ID` | *(unset)* | Enables MSAL.js browser SSO when set to a SPA App Registration's client id |
| `AAD_AUTHORITY` | `https://login.microsoftonline.com/organizations` | MSAL authority (change to `.../<tenant-id>` for single tenant) |
| `AAD_SCOPES` | `https://cognitiveservices.azure.com/user_impersonation` | Comma-separated MSAL scopes |

## Deploy to Azure AKS

The `k8s/` directory has a Kustomize-ready set of manifests. Default
deployment mode is **per-user auth via pasted access tokens** — each
visitor signs in with their own Azure identity by pasting the output of
one `az account get-access-token` command, and discovery lists only
resources under that user's subscriptions. No App Registration or UAMI
needed.

Short version:

1. Build and push the image to ACR (`./scripts/build-and-deploy.sh`).
2. Fill in `REPLACE_WITH_IMAGE` in `k8s/deployment.yaml` and `kubectl apply -k k8s/`.
3. Done. Users open the site and click "Sign in with Azure" in the header.

Full step-by-step lives in [`k8s/README.md`](k8s/README.md).

### Redeploy after code changes

A commit to `main` does **not** touch the running pod on its own — the image
still needs to be rebuilt and rolled. Use the helper script:

```bash
ACR=<your-acr-name> ./scripts/build-and-deploy.sh
# or pin a tag
ACR=<your-acr-name> TAG=v4 ./scripts/build-and-deploy.sh
# or preview
DRY_RUN=1 ACR=<your-acr-name> ./scripts/build-and-deploy.sh
```

It does `docker build --platform linux/amd64` → `az acr login` →
`docker push` → `kubectl set image` → `kubectl rollout status`. Defaults:
image repo `aoai-benchmark`, namespace `aoai-benchmark`, deployment
`aoai-benchmark`, container `app` — all overridable via env vars (see the
comment block at the top of the script).

After it finishes, a quick curl confirms the new code is live:

```bash
curl https://<your-host>/api/auth/msal-config  # {"enabled":false} or full MSAL config
curl https://<your-host>/readyz                # HTTP 200 regardless of credential state
curl https://<your-host>/api/resources/discover  # one-line error, never a JSON dump
```

### Per-user authentication — how it works

The default auth model is **"bring your own access token"**: each user
pastes a one-hour management-plane token from their own Azure CLI. This
means each user sees their own subscriptions, no App Registration is
required, and the pod has no long-lived credentials of its own.

**User flow:**

1. Open the site. Click **Sign in with Azure** in the top-right of the header.
2. A dialog pops up with a copy-able command. Run it in your terminal:
   ```bash
   az account get-access-token \
     --resource https://management.azure.com \
     --query accessToken -o tsv
   ```
   (Run `az login` first if you haven't. Use `az account set -s <sub>` to
   choose which subscription to look at.)
3. Paste the JWT output back into the dialog and click **Use this token**.
4. Auto Discovery now lists the AOAI / AIServices resources visible to that
   token's identity. Switch subscriptions by repeating with a new token.

**Security properties:**

- The token lives only in the browser tab's `sessionStorage` — cleared when
  the tab closes, not shared across tabs, not sent anywhere except the
  backend of this site (where it's used to call ARM on the user's behalf
  and never persisted to disk).
- Tokens are ~1 hour long. We surface a warning when <5 min remain and
  auto-clear on expiry.
- The backend strictly uses the token as an opaque bearer; ARM itself
  enforces the audience (`aud: management.azure.com`) and the user's RBAC.

**Why not browser SSO (MSAL.js)?** That path exists in the code but requires
an Entra ID App Registration (SPA type, with delegated permissions for
Azure Service Management + Cognitive Services). To skip that registration
step, the current deployment uses paste-token instead. If you later decide
to register an app, set `AAD_CLIENT_ID` in the ConfigMap and the frontend
will auto-enable silent SSO alongside the paste path.

The three credential sources the backend will accept, in priority order:

| Source | Enabled when | Who acts on ARM / AOAI |
|---|---|---|
| **Per-user pasted token** (default) | User clicks "Sign in with Azure" in the header | The signed-in user |
| **MSAL.js browser SSO** (optional) | `AAD_CLIENT_ID` is set in the ConfigMap | The signed-in user |
| **`DefaultAzureCredential` fallback** | No token supplied at all (e.g. local dev with `az login`) | Whichever identity the backend environment has (pod MI / az CLI / etc.) |

For local development, `./scripts/run-local.sh` mounts `~/.azure/` into the
container so the fallback picks up your existing `az login` session — see
[Local dev with Auto Discovery](#local-dev-with-auto-discovery-uses-your-az-login).

## License

This project is for internal benchmarking and testing purposes.
