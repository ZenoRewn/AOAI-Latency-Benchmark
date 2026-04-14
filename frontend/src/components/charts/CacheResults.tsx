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
      <div className="shadow-sm rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-5 flex flex-col items-center justify-center text-center min-h-[180px]">
        <svg
          className="w-8 h-8 text-gray-300 mb-2"
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
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">
          {label}
        </p>
        <p className="text-sm text-gray-400">No cache hit</p>
      </div>
    );
  }

  const missWidth = 100;
  const hitWidth =
    cache.miss_latency_ms > 0
      ? (cache.hit_latency_ms / cache.miss_latency_ms) * 100
      : 0;

  return (
    <div className="shadow-sm rounded-xl bg-white p-5 border border-[#E8E4F0]">
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-4">
        {label}
      </h4>

      {/* Progress bars */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Cache Miss</span>
            <span className="text-xl font-bold text-red-500">
              {Math.round(cache.miss_latency_ms).toLocaleString()} ms
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-red-400"
              style={{ width: `${missWidth}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Cache Hit</span>
            <span className="text-xl font-bold text-emerald-500">
              {Math.round(cache.hit_latency_ms).toLocaleString()} ms
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{ width: `${Math.min(hitWidth, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#F3F0F9] rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-[#8661C5]">
            {(cache.hit_rate * 100).toFixed(1)}%
          </div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">
            Hit Rate
          </div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">
            {cache.speedup_pct.toFixed(1)}%
          </div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">
            Speedup
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-700">
            {cache.cached_tokens.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">
            Cached Tokens
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-700">
            {cache.prompt_tokens.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">
            Prompt Tokens
          </div>
        </div>
      </div>
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
