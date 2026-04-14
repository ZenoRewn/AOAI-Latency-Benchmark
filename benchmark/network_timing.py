"""Network-level timing collection via httpx transport trace callbacks."""

import asyncio
import contextvars
import socket
import time
from dataclasses import dataclass, field

import httpx

# ContextVar to pass network timings from transport to calling benchmark code
_current_timings: contextvars.ContextVar["NetworkTimings | None"] = contextvars.ContextVar(
    "_current_timings", default=None
)


@dataclass
class NetworkTimings:
    dns_ms: float = 0.0
    tcp_connect_ms: float = 0.0
    tls_ms: float = 0.0
    _events: dict = field(default_factory=dict, repr=False)

    def record(self, name: str):
        self._events[name] = time.perf_counter()

    def compute(self, dns_ms: float = 0.0):
        self.dns_ms = dns_ms
        tcp_start = self._events.get("connection.connect_tcp.started")
        tcp_end = self._events.get("connection.connect_tcp.complete")
        if tcp_start and tcp_end:
            total_connect = (tcp_end - tcp_start) * 1000
            self.tcp_connect_ms = round(max(total_connect - dns_ms, 0), 2)

        tls_start = self._events.get("connection.start_tls.started")
        tls_end = self._events.get("connection.start_tls.complete")
        if tls_start and tls_end:
            self.tls_ms = round((tls_end - tls_start) * 1000, 2)


def get_current_timings() -> "NetworkTimings | None":
    return _current_timings.get(None)


class TimingTransport(httpx.AsyncBaseTransport):
    """Wraps an httpx async transport and injects trace callbacks per request."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self._transport = transport or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        timings = NetworkTimings()
        _current_timings.set(timings)

        async def trace(name: str, info: dict):
            timings.record(name)

        request.extensions["trace"] = trace
        return await self._transport.handle_async_request(request)


async def measure_dns(host: str, port: int = 443) -> float:
    """Measure DNS resolution time in milliseconds."""
    loop = asyncio.get_event_loop()
    t0 = time.perf_counter()
    try:
        await loop.getaddrinfo(host, port, family=socket.AF_INET, type=socket.SOCK_STREAM)
    except Exception:
        pass
    return round((time.perf_counter() - t0) * 1000, 2)


@dataclass
class NetworkProbe:
    """Result of a raw-socket network baseline probe."""
    dns_ms: float = 0.0
    tcp_ms: float = 0.0
    tls_ms: float = 0.0
    total_ms: float = 0.0
    resolved_ip: str = ""
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "dns_ms": self.dns_ms,
            "tcp_ms": self.tcp_ms,
            "tls_ms": self.tls_ms,
            "total_ms": self.total_ms,
            "resolved_ip": self.resolved_ip,
            "error": self.error,
        }


import ssl as _ssl


async def probe_network_baseline(host: str, port: int = 443) -> NetworkProbe:
    """Raw socket probe: DNS + TCP + TLS timing, independent of httpx connection pool."""
    probe = NetworkProbe()
    loop = asyncio.get_event_loop()
    try:
        # 1. DNS resolution
        t0 = time.perf_counter()
        addrs = await loop.getaddrinfo(host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        probe.dns_ms = round((time.perf_counter() - t0) * 1000, 2)

        family, _, _, _, addr = addrs[0]
        probe.resolved_ip = addr[0]

        # 2. TCP connect (run in executor to avoid blocking)
        def _tcp_connect():
            sock = socket.socket(family, socket.SOCK_STREAM)
            sock.settimeout(15)
            t = time.perf_counter()
            sock.connect(addr)
            tcp_ms = round((time.perf_counter() - t) * 1000, 2)
            return sock, tcp_ms

        sock, probe.tcp_ms = await loop.run_in_executor(None, _tcp_connect)

        # 3. TLS handshake (run in executor)
        def _tls_handshake():
            ctx = _ssl.create_default_context()
            t = time.perf_counter()
            ssock = ctx.wrap_socket(sock, server_hostname=host)
            tls_ms = round((time.perf_counter() - t) * 1000, 2)
            ssock.close()
            return tls_ms

        probe.tls_ms = await loop.run_in_executor(None, _tls_handshake)
        probe.total_ms = round(probe.dns_ms + probe.tcp_ms + probe.tls_ms, 2)

    except Exception as e:
        probe.error = str(e)

    return probe
