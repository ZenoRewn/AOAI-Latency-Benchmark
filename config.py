"""Configuration constants for Azure OpenAI Latency Benchmark."""

import io
import struct
import wave

COLORS = {
    "primary": "#8661C5",
    "secondary": "#0078D4",
    "primary_light": "#C5B4E3",
    "secondary_light": "#8DC8E8",
}

MODELS = {
    "GPT-5.x Series": [
        "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-5.4-nano",
        "gpt-5.3-chat", "gpt-5.3-codex",
        "gpt-5.2", "gpt-5.2-chat", "gpt-5.2-codex",
        "gpt-5.1", "gpt-5.1-chat", "gpt-5.1-codex", "gpt-5.1-codex-mini", "gpt-5.1-codex-max",
        "gpt-5", "gpt-5-pro", "gpt-5-chat", "gpt-5-mini", "gpt-5-nano", "gpt-5-codex",
    ],
    "GPT-4.1 Series": ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
    "GPT-4o Series": ["gpt-4o", "gpt-4o-mini"],
    "o-Series (Reasoning)": [
        "o4-mini", "o3-pro", "o3", "o3-mini", "o1", "o1-preview", "o1-mini", "codex-mini",
    ],
    "Open Source": ["gpt-oss-120b", "gpt-oss-20b"],
    "Model Router": ["model-router"],
    "Embeddings": ["text-embedding-3-large", "text-embedding-3-small"],
    "Legacy (Deprecated)": ["text-embedding-ada-002"],
    "Image": ["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini", "dall-e-3"],
    "Video": ["sora-2", "sora"],
    "Audio & Speech": [
        "gpt-audio-1.5", "gpt-audio", "gpt-audio-mini",
        "gpt-realtime-1.5", "gpt-realtime", "gpt-realtime-mini",
        "gpt-4o-audio-preview", "gpt-4o-mini-audio-preview",
        "gpt-4o-transcribe", "gpt-4o-mini-transcribe",
        "gpt-4o-mini-tts", "tts", "tts-hd", "whisper",
    ],
    "Other": ["computer-use-preview"],
}

DEFAULT_API_VERSION = "2025-03-01-preview"
DEFAULT_ITERATIONS = 3
DEFAULT_MAX_TOKENS = 100
DEFAULT_TIMEOUT = 30
DEFAULT_USER_PROMPT = "Explain the concept of cloud computing in a few sentences."

# Reasoning options (GPT-5.x / o-Series)
REASONING_EFFORT_OPTIONS = ["none", "low", "medium", "high"]
REASONING_SUMMARY_OPTIONS = ["off", "auto", "concise", "detailed"]

# Pre-canned benchmark presets surfaced to the UI so users can pick
# common test profiles without hand-tuning every field.
BENCHMARK_PRESETS = {
    "fast_chat": {
        "description": "Quick chat latency sanity check (non-reasoning)",
        "api_types": ["chat"],
        "iterations": 5,
        "max_tokens": 64,
        "streaming": True,
        "reasoning_efforts": [],
    },
    "o_series_reasoning": {
        "description": "o1/o3 reasoning models with high effort",
        "api_types": ["chat"],
        "iterations": 3,
        "max_tokens": 512,
        "streaming": True,
        "reasoning_efforts": ["high"],
    },
    "gpt5_reasoning_sweep": {
        "description": "GPT-5.x reasoning effort sweep (low/medium/high)",
        "api_types": ["responses"],
        "iterations": 3,
        "max_tokens": 256,
        "streaming": True,
        "reasoning_efforts": ["low", "medium", "high"],
    },
    "cold_vs_warm": {
        "description": "Compare first call (cold) vs warmed-up calls",
        "api_types": ["chat"],
        "iterations": 5,
        "warmup": False,     # intentionally skip warmup so call #1 is cold
        "max_tokens": 128,
        "streaming": True,
    },
    "cache_hit": {
        "description": "Prompt cache hit/miss latency comparison",
        "api_types": ["chat"],
        "iterations": 2,
        "max_tokens": 128,
        "test_cache": True,
        "streaming": False,
    },
}

# These model prefixes use max_completion_tokens instead of max_tokens in Chat API
MAX_COMPLETION_TOKENS_MODELS = ("o1", "o3", "o4", "gpt-5", "codex-mini", "gpt-oss")

# Embedding defaults
DEFAULT_EMBEDDING_INPUT = "Azure OpenAI latency benchmark test input for embeddings."

# TTS defaults
DEFAULT_TTS_INPUT = "Hello, this is a latency benchmark test for Azure OpenAI text to speech."
DEFAULT_TTS_VOICE = "alloy"

# Image generation defaults
DEFAULT_IMAGE_PROMPT = "A simple blue circle on a white background"
DEFAULT_IMAGE_SIZE = "1024x1024"


def generate_silence_wav(duration_s: float = 3.0, sample_rate: int = 16000) -> bytes:
    """Generate a silent WAV file in memory for Whisper testing."""
    num_samples = int(sample_rate * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))
    return buf.getvalue()


WHISPER_TEST_AUDIO = generate_silence_wav()

# Cache test requires >=1024 tokens in system prompt to trigger prompt caching.
# This is a ~1500 token fixed text used for cache hit/miss comparison.
CACHE_TEST_SYSTEM_PROMPT = (
    "You are a highly knowledgeable AI assistant specializing in cloud computing, "
    "distributed systems, and enterprise software architecture. Your expertise spans "
    "across multiple domains including but not limited to: infrastructure as a service "
    "(IaaS), platform as a service (PaaS), software as a service (SaaS), serverless "
    "computing, containerization and orchestration with Kubernetes and Docker, "
    "microservices architecture, event-driven architecture, domain-driven design, "
    "continuous integration and continuous deployment (CI/CD) pipelines, "
    "infrastructure as code using tools like Terraform, Pulumi, and ARM templates, "
    "monitoring and observability with tools like Prometheus, Grafana, and Azure Monitor, "
    "security best practices including zero-trust architecture, identity and access "
    "management, encryption at rest and in transit, network security groups, "
    "virtual private networks, and Web Application Firewalls. "
    "You are also deeply familiar with Azure services including Azure OpenAI Service, "
    "Azure Cognitive Services, Azure Machine Learning, Azure Databricks, Azure Synapse "
    "Analytics, Azure Data Factory, Azure Stream Analytics, Azure Event Hubs, "
    "Azure Service Bus, Azure Functions, Azure Logic Apps, Azure API Management, "
    "Azure Front Door, Azure CDN, Azure Traffic Manager, Azure Load Balancer, "
    "Azure Application Gateway, Azure Kubernetes Service (AKS), Azure Container "
    "Instances (ACI), Azure Container Registry (ACR), Azure DevOps, GitHub Actions, "
    "Azure Repos, Azure Boards, Azure Artifacts, Azure Pipelines, Azure Monitor, "
    "Azure Log Analytics, Azure Application Insights, Azure Sentinel, Azure Key Vault, "
    "Azure Active Directory (now Entra ID), Azure Policy, Azure Blueprints, "
    "Azure Resource Manager, Azure Bicep, Azure Cost Management, Azure Advisor, "
    "Azure Service Health, Azure Resource Graph, Azure Lighthouse, Azure Arc, "
    "Azure Stack Hub, Azure Stack Edge, Azure Stack HCI, Azure VMware Solution, "
    "Azure Virtual Desktop, Azure Bastion, Azure Firewall, Azure DDoS Protection, "
    "Azure Private Link, Azure Private Endpoint, Azure Virtual Network, Azure ExpressRoute, "
    "Azure VPN Gateway, Azure DNS, Azure Cosmos DB, Azure SQL Database, Azure SQL "
    "Managed Instance, Azure Database for PostgreSQL, Azure Database for MySQL, "
    "Azure Cache for Redis, Azure Storage (Blob, File, Queue, Table), Azure Data Lake "
    "Storage, Azure Backup, Azure Site Recovery, Azure Migrate, and Azure Purview. "
    "When answering questions, provide detailed, technically accurate responses that "
    "consider scalability, reliability, security, cost-effectiveness, and operational "
    "excellence. Use specific Azure service names and features where applicable. "
    "Always consider the Well-Architected Framework pillars: reliability, security, "
    "cost optimization, operational excellence, and performance efficiency. "
    "Provide code examples when appropriate, using Python, C#, TypeScript, or Bicep "
    "as the primary languages. Include best practices, common pitfalls to avoid, "
    "and recommendations for monitoring and troubleshooting. When discussing architecture "
    "patterns, reference established patterns such as Circuit Breaker, Retry with "
    "Exponential Backoff, Bulkhead, Saga, CQRS, Event Sourcing, Strangler Fig, "
    "Ambassador, Sidecar, and Gateway Aggregation. Consider multi-region deployment "
    "strategies, disaster recovery planning, and data residency requirements. "
    "Be concise but thorough, and always prioritize accuracy over brevity."
)
