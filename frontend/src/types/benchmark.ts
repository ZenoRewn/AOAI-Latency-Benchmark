export interface RegionConfig {
  name: string;
  endpoint: string;
}

export interface BenchmarkConfig {
  regions: RegionConfig[];
  models: string[];
  api_types: string[];
  iterations: number;
  rounds: number;
  max_tokens: number;
  timeout: number;
  system_prompt: string;
  user_prompt: string;
  test_cache: boolean;
  api_key: string | null;
  api_version: string;
  reasoning_efforts: string[];
  reasoning_summary: string | null;
  streaming: boolean;
  warmup: boolean;
  concurrency: number;
  mode: "benchmark" | "monitor";
  monitor_interval: number;
  monitor_duration: number;
}

export interface SingleCallMetrics {
  iteration: number;
  ttft_ms: number | null;
  total_latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  tokens_per_second: number;
  request_id: string;
  dns_ms: number;
  tcp_connect_ms: number;
  tls_ms: number;
  ttfb_ms: number | null;
  token_gen_ms: number | null;
  backend_est_ms: number | null;
  error: string | null;
}

export interface CacheTestResult {
  miss_latency_ms: number;
  hit_latency_ms: number;
  cached_tokens: number;
  prompt_tokens: number;
  hit_rate: number;
  speedup_pct: number;
}

export interface BenchmarkResult {
  region: string;
  endpoint: string;
  model: string;
  api_type: string;
  reasoning_effort: string;
  round: number;
  timestamp: string;
  avg_ttft_ms: number;
  p50_ttft_ms: number;
  p95_ttft_ms: number;
  p99_ttft_ms: number;
  avg_latency_ms: number;
  avg_tps: number;
  error_rate: number;
  std_ttft_ms: number;
  min_ttft_ms: number;
  max_ttft_ms: number;
  std_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  avg_dns_ms: number;
  avg_tcp_connect_ms: number;
  avg_tls_ms: number;
  avg_ttfb_ms: number;
  avg_token_gen_ms: number;
  avg_backend_est_ms: number;
  network_probe_ms: number;
  probe_dns_ms: number;
  probe_tcp_ms: number;
  probe_tls_ms: number;
  calls: SingleCallMetrics[];
  cache: CacheTestResult | null;
}

export interface DiscoveredResource {
  name: string;
  endpoint: string;
  region: string;
  kind?: string;
  subscription_id?: string;
}

export interface DiscoverResponse {
  resources: DiscoveredResource[];
  error: string | null;
}

export interface AuthStatus {
  method:
    | "azure_cli"
    | "workload_identity"
    | "managed_identity"
    | "service_principal"
    | "env_vars"
    | "none";
  detail: string;
}

export interface AppConfig {
  models: Record<string, string[]>;
  default_api_version: string;
  default_iterations: number;
  default_max_tokens: number;
}

export interface PromptScenario {
  id: string;
  name: string;
  system: string;
  user: string;
  createdAt: number;
}

// SSE event types
export interface SSEStarted {
  type: "started";
  total_tasks: number;
  total_calls: number;
  mode?: string;
  duration?: number;
}

export interface SSEProgress {
  type: "progress";
  current: number;
  total: number;
  message: string;
}

export interface SSECallResult {
  type: "call_result";
  current: number;
  total: number;
  region: string;
  model: string;
  api_type: string;
  reasoning_effort: string;
  iteration: number;
  round: number;
  metrics: SingleCallMetrics;
}

export interface SSEResult {
  type: "result";
  data: BenchmarkResult;
}

export interface SSEProbe {
  type: "probe";
  region: string;
  probe: {
    dns_ms: number;
    tcp_ms: number;
    tls_ms: number;
    total_ms: number;
    resolved_ip: string;
    error: string | null;
  };
}

export type SSEEvent =
  | SSEStarted
  | SSEProgress
  | SSECallResult
  | SSEResult
  | SSEProbe
  | { type: "warmup"; message: string }
  | { type: "error"; message: string; region?: string }
  | { type: "complete"; total_results: number; message: string }
  | { type: "done" }
  | { type: "monitor_point"; timestamp: string; region: string; model: string; api_type: string; reasoning_effort: string; probe: number; metrics: SingleCallMetrics };
