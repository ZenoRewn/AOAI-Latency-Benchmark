import React from "react";
import type { BenchmarkResult } from "@/types/benchmark";
import ChartCard from "./ChartCard";

interface CacheResultsProps {
  results: BenchmarkResult[];
}

function CacheCard({ result }: { result: BenchmarkResult }) {
  const cache = result.cache;
  const effort = result.reasoning_effort || "";
  const label = effort
    ? `${result.region} / ${result.model} (${effort})`
    : `${result.region} / ${result.model}`;

  if (!cache || cache.cached_tokens === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_60%,transparent)] p-5 flex flex-col items-center justify-center text-center min-h-[180px]">
        <svg
          className="w-8 h-8 text-[var(--muted-foreground)] opacity-60 mb-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V3.375m0 0L9.75 5.625M12 3.375l2.25 2.25"
          />
        </svg>
        <p className="eyebrow mb-1 truncate max-w-full">{label}</p>
        <p className="text-sm text-muted-foreground">No cache hit</p>
      </div>
    );
  }

  const missWidth = 100;
  const hitWidth =
    cache.miss_latency_ms > 0
      ? (cache.hit_latency_ms / cache.miss_latency_ms) * 100
      : 0;

  return (
    <div className="rounded-xl bg-card p-5 border border-[var(--border)] shadow-sm">
      <h4 className="eyebrow mb-4 truncate" title={label}>
        {label}
      </h4>

      {/* Progress bars */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="flex justify-between items-baseline text-xs text-muted-foreground mb-1">
            <span>Cache Miss</span>
            <span
              className="stat-value text-lg"
              style={{ color: "var(--display-rose)" }}
            >
              {Math.round(cache.miss_latency_ms).toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                ms
              </span>
            </span>
          </div>
          <div className="h-3 rounded-full bg-[var(--secondary)] overflow-hidden border border-[var(--border)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${missWidth}%`,
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--error) 80%, transparent), var(--error))",
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-baseline text-xs text-muted-foreground mb-1">
            <span>Cache Hit</span>
            <span
              className="stat-value text-lg"
              style={{ color: "var(--display-green)" }}
            >
              {Math.round(cache.hit_latency_ms).toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                ms
              </span>
            </span>
          </div>
          <div className="h-3 rounded-full bg-[var(--secondary)] overflow-hidden border border-[var(--border)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(hitWidth, 100)}%`,
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--success) 80%, transparent), var(--success))",
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          value={`${(cache.hit_rate * 100).toFixed(1)}%`}
          label="Hit Rate"
          color="var(--display-violet)"
          bg="color-mix(in srgb, var(--display-violet) 10%, transparent)"
        />
        <MiniStat
          value={`${cache.speedup_pct.toFixed(1)}%`}
          label="Speedup"
          color="var(--display-green)"
          bg="color-mix(in srgb, var(--success) 12%, transparent)"
        />
        <MiniStat
          value={cache.cached_tokens.toLocaleString()}
          label="Cached Tokens"
          color="var(--foreground)"
          bg="var(--secondary)"
        />
        <MiniStat
          value={cache.prompt_tokens.toLocaleString()}
          label="Prompt Tokens"
          color="var(--foreground)"
          bg="var(--secondary)"
        />
      </div>
    </div>
  );
}

function MiniStat({
  value,
  label,
  color,
  bg,
}: {
  value: string;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      className="rounded-lg p-3 text-center border border-[var(--border)]"
      style={{ background: bg }}
    >
      <div className="stat-value text-lg" style={{ color }}>
        {value}
      </div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

export default function CacheResults({ results }: CacheResultsProps) {
  const cacheResults = results.filter((r) => r.cache !== null);

  if (cacheResults.length === 0) return null;

  return (
    <ChartCard title="Prompt Cache Results">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cacheResults.map((result, i) => (
          <CacheCard key={i} result={result} />
        ))}
      </div>
    </ChartCard>
  );
}
