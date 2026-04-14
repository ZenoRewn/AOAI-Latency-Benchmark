"""Three-tier authentication: az login → environment variables → manual input."""

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


async def detect_auth_method() -> dict:
    """Detect available authentication method.

    Returns dict with:
        method: "azure_cli" | "env_vars" | "none"
        detail: human-readable description
    """
    # 1. Try DefaultAzureCredential (covers az login, managed identity, etc.)
    try:
        from azure.identity.aio import DefaultAzureCredential

        credential = DefaultAzureCredential()
        token = await credential.get_token(TOKEN_SCOPE)
        await credential.close()
        if token:
            return {"method": "azure_cli", "detail": "Azure CLI / DefaultAzureCredential"}
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
) -> AsyncAzureOpenAI:
    """Create an AsyncAzureOpenAI client with the best available auth.

    Priority:
    1. Explicit api_key parameter
    2. DefaultAzureCredential (az login)
    3. AZURE_OPENAI_API_KEY environment variable
    """
    http_client = httpx.AsyncClient(
        transport=TimingTransport(),
        event_hooks={"response": [_capture_request_id]},
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
        "or login with 'az login'."
    )
