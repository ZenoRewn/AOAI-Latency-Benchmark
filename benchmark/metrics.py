"""Data models for benchmark results."""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field, asdict
from typing import Optional


def _percentile_sorted(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    idx = max(0, min(n - 1, int(round(pct * (n - 1)))))
    return sorted_vals[idx]


@dataclass
class SingleCallMetrics:
    iteration: int
    ttft_ms: Optional[float] = None
    total_latency_ms: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    tokens_per_second: float = 0.0
    request_id: str = ""
    dns_ms: float = 0.0
    tcp_connect_ms: float = 0.0
    tls_ms: float = 0.0
    ttfb_ms: Optional[float] = None        # HTTP response headers arrive
    token_gen_ms: Optional[float] = None    # Token generation = total - TTFT
    backend_est_ms: Optional[float] = None  # Backend estimate = TTFB - network baseline
    queue_wait_ms: Optional[float] = None   # Semaphore wait (client-side queuing)
    error: Optional[str] = None
    error_category: Optional[str] = None    # "timeout"|"auth"|"rate_limit"|"server_error"|"network"|"client_error"|"other"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CacheTestResult:
    miss_latency_ms: float = 0.0
    hit_latency_ms: float = 0.0
    cached_tokens: int = 0
    prompt_tokens: int = 0
    hit_rate: float = 0.0
    speedup_pct: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BenchmarkResult:
    region: str
    endpoint: str
    model: str
    api_type: str  # "chat" | "responses"
    reasoning_effort: str = ""  # "", "low", "medium", "high"
    round: int = 1  # benchmark round number
    timestamp: str = ""
    calls: list[SingleCallMetrics] = field(default_factory=list)
    cache: Optional[CacheTestResult] = None
    # Aggregated metrics (filled by compute_aggregates)
    avg_ttft_ms: float = 0.0
    p50_ttft_ms: float = 0.0
    p90_ttft_ms: float = 0.0
    p95_ttft_ms: float = 0.0
    p99_ttft_ms: float = 0.0
    avg_latency_ms: float = 0.0
    p50_latency_ms: float = 0.0
    p90_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    avg_tps: float = 0.0
    error_rate: float = 0.0
    error_category_counts: dict = field(default_factory=dict)
    # Extended statistics
    std_ttft_ms: float = 0.0
    min_ttft_ms: float = 0.0
    max_ttft_ms: float = 0.0
    std_latency_ms: float = 0.0
    min_latency_ms: float = 0.0
    max_latency_ms: float = 0.0
    # Network timing aggregates
    avg_dns_ms: float = 0.0
    avg_tcp_connect_ms: float = 0.0
    avg_tls_ms: float = 0.0
    # Latency stage aggregates
    avg_ttfb_ms: float = 0.0
    avg_token_gen_ms: float = 0.0
    avg_backend_est_ms: float = 0.0
    # Client-side queuing (only meaningful when concurrency > 1)
    avg_queue_wait_ms: float = 0.0
    p95_queue_wait_ms: float = 0.0
    network_probe_ms: float = 0.0
    # Raw-socket network baseline, broken down. Probed once per region so
    # the values reflect the physical link (unlike per-call dns/tcp/tls
    # which are 0 on reused connections).
    probe_dns_ms: float = 0.0
    probe_tcp_ms: float = 0.0
    probe_tls_ms: float = 0.0
    # Sample counts
    sample_count: int = 0
    success_count: int = 0

    def compute_aggregates(self) -> None:
        successful = [c for c in self.calls if c.error is None]
        total = len(self.calls)
        self.sample_count = total
        self.success_count = len(successful)

        # Error category breakdown on failures
        err_counts: dict[str, int] = {}
        for c in self.calls:
            if c.error is not None:
                cat = c.error_category or "other"
                err_counts[cat] = err_counts.get(cat, 0) + 1
        self.error_category_counts = err_counts

        if not successful:
            self.error_rate = 1.0 if total > 0 else 0.0
            return

        ttfts = sorted(c.ttft_ms for c in successful if c.ttft_ms is not None)
        latencies = sorted(c.total_latency_ms for c in successful)
        tps_values = [c.tokens_per_second for c in successful if c.tokens_per_second > 0]
        qwait = [c.queue_wait_ms for c in successful if c.queue_wait_ms is not None and c.queue_wait_ms > 0]
        n = len(successful)

        if ttfts:
            self.avg_ttft_ms = round(sum(ttfts) / len(ttfts), 2)
            self.p50_ttft_ms = round(_percentile_sorted(ttfts, 0.50), 2)
            self.p90_ttft_ms = round(_percentile_sorted(ttfts, 0.90), 2)
            self.p95_ttft_ms = round(_percentile_sorted(ttfts, 0.95), 2)
            self.p99_ttft_ms = round(_percentile_sorted(ttfts, 0.99), 2)
            self.min_ttft_ms = round(ttfts[0], 2)
            self.max_ttft_ms = round(ttfts[-1], 2)
            self.std_ttft_ms = round(statistics.stdev(ttfts), 2) if len(ttfts) >= 2 else 0.0

        self.avg_latency_ms = round(sum(latencies) / n, 2)
        self.p50_latency_ms = round(_percentile_sorted(latencies, 0.50), 2)
        self.p90_latency_ms = round(_percentile_sorted(latencies, 0.90), 2)
        self.p95_latency_ms = round(_percentile_sorted(latencies, 0.95), 2)
        self.p99_latency_ms = round(_percentile_sorted(latencies, 0.99), 2)
        self.min_latency_ms = round(latencies[0], 2)
        self.max_latency_ms = round(latencies[-1], 2)
        self.std_latency_ms = round(statistics.stdev(latencies), 2) if n >= 2 else 0.0
        self.avg_tps = round(sum(tps_values) / len(tps_values), 2) if tps_values else 0.0
        self.error_rate = round((total - len(successful)) / total, 4) if total > 0 else 0.0

        # Network timing aggregates (only from calls that had connect events)
        dns_vals = [c.dns_ms for c in successful if c.dns_ms > 0]
        tcp_vals = [c.tcp_connect_ms for c in successful if c.tcp_connect_ms > 0]
        tls_vals = [c.tls_ms for c in successful if c.tls_ms > 0]
        if dns_vals:
            self.avg_dns_ms = round(sum(dns_vals) / len(dns_vals), 2)
        if tcp_vals:
            self.avg_tcp_connect_ms = round(sum(tcp_vals) / len(tcp_vals), 2)
        if tls_vals:
            self.avg_tls_ms = round(sum(tls_vals) / len(tls_vals), 2)

        # Latency stage aggregates
        ttfb_vals = [c.ttfb_ms for c in successful if c.ttfb_ms is not None]
        tgen_vals = [c.token_gen_ms for c in successful if c.token_gen_ms is not None and c.token_gen_ms > 0]
        backend_vals = [c.backend_est_ms for c in successful if c.backend_est_ms is not None]
        if ttfb_vals:
            self.avg_ttfb_ms = round(sum(ttfb_vals) / len(ttfb_vals), 2)
        if tgen_vals:
            self.avg_token_gen_ms = round(sum(tgen_vals) / len(tgen_vals), 2)
        if backend_vals:
            self.avg_backend_est_ms = round(sum(backend_vals) / len(backend_vals), 2)

        if qwait:
            qwait_sorted = sorted(qwait)
            self.avg_queue_wait_ms = round(sum(qwait_sorted) / len(qwait_sorted), 2)
            self.p95_queue_wait_ms = round(_percentile_sorted(qwait_sorted, 0.95), 2)

    def to_dict(self) -> dict:
        d = {
            "region": self.region,
            "endpoint": self.endpoint,
            "model": self.model,
            "api_type": self.api_type,
            "reasoning_effort": self.reasoning_effort,
            "round": self.round,
            "timestamp": self.timestamp,
            "avg_ttft_ms": self.avg_ttft_ms,
            "p50_ttft_ms": self.p50_ttft_ms,
            "p90_ttft_ms": self.p90_ttft_ms,
            "p95_ttft_ms": self.p95_ttft_ms,
            "p99_ttft_ms": self.p99_ttft_ms,
            "avg_latency_ms": self.avg_latency_ms,
            "p50_latency_ms": self.p50_latency_ms,
            "p90_latency_ms": self.p90_latency_ms,
            "p95_latency_ms": self.p95_latency_ms,
            "p99_latency_ms": self.p99_latency_ms,
            "avg_tps": self.avg_tps,
            "error_rate": self.error_rate,
            "error_category_counts": self.error_category_counts,
            "sample_count": self.sample_count,
            "success_count": self.success_count,
            "std_ttft_ms": self.std_ttft_ms,
            "min_ttft_ms": self.min_ttft_ms,
            "max_ttft_ms": self.max_ttft_ms,
            "std_latency_ms": self.std_latency_ms,
            "min_latency_ms": self.min_latency_ms,
            "max_latency_ms": self.max_latency_ms,
            "avg_dns_ms": self.avg_dns_ms,
            "avg_tcp_connect_ms": self.avg_tcp_connect_ms,
            "avg_tls_ms": self.avg_tls_ms,
            "avg_ttfb_ms": self.avg_ttfb_ms,
            "avg_token_gen_ms": self.avg_token_gen_ms,
            "avg_backend_est_ms": self.avg_backend_est_ms,
            "avg_queue_wait_ms": self.avg_queue_wait_ms,
            "p95_queue_wait_ms": self.p95_queue_wait_ms,
            "network_probe_ms": self.network_probe_ms,
            "probe_dns_ms": self.probe_dns_ms,
            "probe_tcp_ms": self.probe_tcp_ms,
            "probe_tls_ms": self.probe_tls_ms,
            "calls": [c.to_dict() for c in self.calls],
            "cache": self.cache.to_dict() if self.cache else None,
        }
        return d
