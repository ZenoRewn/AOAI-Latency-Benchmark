"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SummaryCards } from "@/components/results/SummaryCards";
import { DetailTable } from "@/components/results/DetailTable";
import TTFTChart from "@/components/charts/TTFTChart";
import LatencyChart from "@/components/charts/LatencyChart";
import TPSChart from "@/components/charts/TPSChart";
import PercentileChart from "@/components/charts/PercentileChart";
import LatencyBreakdownChart from "@/components/charts/LatencyBreakdownChart";
import HeatmapChart from "@/components/charts/HeatmapChart";
import CacheResults from "@/components/charts/CacheResults";
import type { BenchmarkResult } from "@/types/benchmark";

interface ResultsPanelProps {
  results: BenchmarkResult[];
  runId: string | null;
  onNewTest?: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resultsToCsv(results: BenchmarkResult[]): string {
  const headers = [
    "Round",
    "Region",
    "Model",
    "API",
    "Reasoning",
    "Avg TTFT (ms)",
    "P50 TTFT (ms)",
    "P95 TTFT (ms)",
    "P99 TTFT (ms)",
    "Avg Latency (ms)",
    "Avg TPS",
    "Error Rate",
    "Avg TTFB (ms)",
    "Avg DNS (ms)",
    "Avg TCP (ms)",
    "Avg TLS (ms)",
    "Avg Token Gen (ms)",
    "Network Probe (ms)",
  ];

  const rows = results.map((r) =>
    [
      r.round,
      r.region,
      r.model,
      r.api_type,
      r.reasoning_effort,
      r.avg_ttft_ms.toFixed(1),
      r.p50_ttft_ms.toFixed(1),
      r.p95_ttft_ms.toFixed(1),
      r.p99_ttft_ms.toFixed(1),
      r.avg_latency_ms.toFixed(1),
      r.avg_tps.toFixed(2),
      (r.error_rate * 100).toFixed(1) + "%",
      r.avg_ttfb_ms.toFixed(1),
      r.avg_dns_ms.toFixed(1),
      r.avg_tcp_connect_ms.toFixed(1),
      r.avg_tls_ms.toFixed(1),
      r.avg_token_gen_ms.toFixed(1),
      r.network_probe_ms.toFixed(1),
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export function ResultsPanel({ results, runId, onNewTest }: ResultsPanelProps) {
  const handleExportCsv = useCallback(() => {
    const csv = resultsToCsv(results);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const filename = runId ? `benchmark_${runId}.csv` : "benchmark_results.csv";
    downloadBlob(blob, filename);
  }, [results, runId]);

  const handleExportExcel = useCallback(() => {
    // Export as TSV with .xls extension — opens in Excel without extra deps
    const headers = [
      "Round",
      "Region",
      "Model",
      "API",
      "Reasoning",
      "Avg TTFT (ms)",
      "P50 TTFT (ms)",
      "P95 TTFT (ms)",
      "P99 TTFT (ms)",
      "Avg Latency (ms)",
      "Avg TPS",
      "Error Rate",
      "Avg TTFB (ms)",
      "Avg DNS (ms)",
      "Avg TCP (ms)",
      "Avg TLS (ms)",
      "Avg Token Gen (ms)",
      "Network Probe (ms)",
    ];

    const rows = results.map((r) =>
      [
        r.round,
        r.region,
        r.model,
        r.api_type,
        r.reasoning_effort,
        r.avg_ttft_ms.toFixed(1),
        r.p50_ttft_ms.toFixed(1),
        r.p95_ttft_ms.toFixed(1),
        r.p99_ttft_ms.toFixed(1),
        r.avg_latency_ms.toFixed(1),
        r.avg_tps.toFixed(2),
        (r.error_rate * 100).toFixed(1) + "%",
        r.avg_ttfb_ms.toFixed(1),
        r.avg_dns_ms.toFixed(1),
        r.avg_tcp_connect_ms.toFixed(1),
        r.avg_tls_ms.toFixed(1),
        r.avg_token_gen_ms.toFixed(1),
        r.network_probe_ms.toFixed(1),
      ].join("\t")
    );

    const tsv = [headers.join("\t"), ...rows].join("\n");
    const blob = new Blob([tsv], { type: "application/vnd.ms-excel" });
    const filename = runId ? `benchmark_${runId}.xls` : "benchmark_results.xls";
    downloadBlob(blob, filename);
  }, [results, runId]);

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards */}
      <SummaryCards results={results} />

      {/* Export bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          Export Excel
        </Button>
        {onNewTest && (
          <Button variant="default" size="sm" onClick={onNewTest}>
            New Test
          </Button>
        )}
      </div>

      {/* Charts */}
      <TTFTChart results={results} />
      <LatencyChart results={results} />
      <TPSChart results={results} />
      <PercentileChart results={results} />
      <LatencyBreakdownChart results={results} />
      <HeatmapChart results={results} />
      <CacheResults results={results} />

      {/* Detail Table */}
      <DetailTable results={results} />
    </div>
  );
}
