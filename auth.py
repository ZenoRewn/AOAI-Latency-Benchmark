"""Three-tier authentication: DefaultAzureCredential → env → manual input.

On AKS with Workload Identity, DefaultAzureCredential picks up the federated
pod identity automatically — no code change needed. The `method` label
returned by detect_auth_method() tries to distinguish the concrete source
(azure_cli / workload_identity / managed_identity) so the UI can surface it.

Future extension point: if the frontend ever sends a user-bound AAD access
token (via MSAL.js and an AAD App Registration), prepend a branch at the top
of get_client() that uses `azure_ad_token=<token>` directly.
"""

import contextvars
import os
import logging

import httpx
from openai import AsyncAzureOpenAI

from benchmark.network_timing import TimingTransport

logger = logging.getLogger(__name__)

TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default"

# ContextVar to pass the latest apim-request-id back to the calling benchmark code
last_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("last_request_id", default="")


async def _capture_request_id(response: httpx.Response) -> None:
    """httpx response event hook — capture apim-request-id header."""
    rid = response.headers.get("apim-request-id", "")
    if rid:
        last_request_id.set(rid)


def _classify_default_credential_source() -> tuple[str, str]:
    """Guess which credential source inside DefaultAzureCredential is active.

    Pure env-var heuristic — DefaultAzureCredential itself doesn't expose which
    inner credential answered. Good enough for UI labelling.
    """
    # Workload Identity (AKS federated credential) — these env vars are injected
    # by the workload-identity webhook when the Pod has the right annotations.
    if os.environ.get("AZURE_FEDERATED_TOKEN_FILE") and os.environ.get("AZURE_CLIENT_ID"):
        return "workload_identity", "AKS Workload Identity (federated token)"
    # System-assigned / user-assigned Managed Identity via IMDS
    if os.environ.get("IDENTITY_ENDPOINT") or os.environ.get("MSI_ENDPOINT"):
        return "managed_identity", "Managed Identity (IMDS)"
    # Service principal via env
    if os.environ.get("AZURE_CLIENT_ID") and os.environ.get("AZURE_CLIENT_SECRET"):
        return "service_principal", "Service Principal (AZURE_CLIENT_ID/SECRET)"
    # Local developer
    return "azure_cli", "Azure CLI / DefaultAzureCredential"


async def detect_auth_method() -> dict:
    """Detect available authentication method.

    Returns dict with:
        method: "workload_identity" | "managed_identity" | "service_principal"
              | "azure_cli" | "env_vars" | "none"
        detail: human-readable description
    """
    # 1. Try DefaultAzureCredential (covers az login, MI, Workload Identity, etc.)
    try:
        from azure.identity.aio import DefaultAzureCredential

        credential = DefaultAzureCredential()
        token = await credential.get_token(TOKEN_SCOPE)
        await credential.close()
        if token:
            method, detail = _classify_default_credential_source()
            return {"method": method, "detail": detail}
    except Exception as e:
        logger.debug(f"DefaultAzureCredential failed: {e}")

    # 2. Check environment variables
    if os.environ.get("AZURE_OPENAI_API_KEY"):
        return {"method": "env_vars", "detail": "Environment variable AZURE_OPENAI_API_KEY"}

    return {"method": "none", "detail": "No credentials detected. Please provide API key manually."}


async def get_client(
    endpoint: str,
    api_version: str,
    api_key: str | None = None,
    aad_token: str | None = None,
) -> AsyncAzureOpenAI:
    """Create an AsyncAzureOpenAI client with the best available auth.

    Priority:
    0. Per-user AAD bearer token (from browser MSAL.js)
    1. Explicit api_key parameter
    2. DefaultAzureCredential (az login / Workload Identity / Managed Identity)
    3. AZURE_OPENAI_API_KEY environment variable
    """
    http_client = httpx.AsyncClient(
        transport=TimingTransport(),
        event_hooks={"response": [_capture_request_id]},
    )

    # 0. Per-user AAD bearer token from the frontend MSAL.js flow.
    # The token has already been acquired against the Azure OpenAI scope,
    # so we hand it to the SDK verbatim. Tokens are short-lived (~1h);
    # a benchmark run longer than that should re-acquire in the browser.
    if aad_token:
        return AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token=aad_token,
            api_version=api_version,
            http_client=http_client,
        )

    # 1. Explicit API key
    if api_key:
        return AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version,
            http_client=http_client,
        )

    # 2. DefaultAzureCredential
    try:
        from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider

        credential = DefaultAzureCredential()
        token_provider = get_bearer_token_provider(credential, TOKEN_SCOPE)
        return AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=token_provider,
            api_version=api_version,
            http_client=http_client,
        )
    except Exception as e:
        logger.debug(f"DefaultAzureCredential client creation failed: {e}")

    # 3. Environment variable
    env_key = os.environ.get("AZURE_OPENAI_API_KEY")
    if env_key:
        return AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=env_key,
            api_version=api_version,
            http_client=http_client,
        )

    raise ValueError(
        "No authentication available. Provide an API key, set AZURE_OPENAI_API_KEY, "
        "or login with 'az login' / attach a Managed Identity."
    )
