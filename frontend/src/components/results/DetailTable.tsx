"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BenchmarkResult } from "@/types/benchmark";

interface DetailTableProps {
  results: BenchmarkResult[];
}

type SortKey =
  | "round"
  | "region"
  | "model"
  | "api_type"
  | "reasoning_effort"
  | "avg_ttfb_ms"
  | "avg_ttft_ms"
  | "p50_ttft_ms"
  | "p95_ttft_ms"
  | "p99_ttft_ms"
  | "avg_latency_ms"
  | "avg_tps"
  | "error_rate";

type SortDir = "asc" | "desc";

const columns: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "round", label: "Round", numeric: true },
  { key: "region", label: "Region", numeric: false },
  { key: "model", label: "Model", numeric: false },
  { key: "api_type", label: "API", numeric: false },
  { key: "reasoning_effort", label: "Reasoning", numeric: false },
  { key: "avg_ttfb_ms", label: "TTFB", numeric: true },
  { key: "avg_ttft_ms", label: "Avg TTFT", numeric: true },
  { key: "p50_ttft_ms", label: "P50 TTFT", numeric: true },
  { key: "p95_ttft_ms", label: "P95 TTFT", numeric: true },
  { key: "p99_ttft_ms", label: "P99 TTFT", numeric: true },
  { key: "avg_latency_ms", label: "Avg Latency", numeric: true },
  { key: "avg_tps", label: "Avg TPS", numeric: true },
  { key: "error_rate", label: "Error Rate", numeric: true },
];

function fmtVal(value: number | null | undefined, decimals = 1): string {
  if (value == null || value === 0) return "-";
  return value.toFixed(decimals);
}

function fmtPct(value: number): string {
  if (value === 0) return "0%";
  return `${(value * 100).toFixed(1)}%`;
}

export function DetailTable({ results }: DetailTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("round");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortDir === "asc" ? cmp : -cmp;
      }

      const aNum = typeof aVal === "number" ? aVal : 0;
      const bNum = typeof bVal === "number" ? bVal : 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "cursor-pointer select-none hover:bg-muted/50 transition-colors",
                  col.numeric && "text-right"
                )}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortIndicator(col.key)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No results
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((r, idx) => (
              <TableRow key={idx}>
                <TableCell>{r.round}</TableCell>
                <TableCell>{r.region}</TableCell>
                <TableCell className="max-w-[140px] truncate">
                  {r.model}
                </TableCell>
                <TableCell>{r.api_type}</TableCell>
                <TableCell>{r.reasoning_effort || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtVal(r.avg_ttfb_ms)}
                </TableCell>

                {/* Avg TTFT with hover tooltip */}
                <TableCell
                  className="text-right tabular-nums"
                  title={
                    r.avg_ttft_ms > 0
                      ? `\u00b1${r.std_ttft_ms.toFixed(1)} (${r.min_ttft_ms.toFixed(0)}~${r.max_ttft_ms.toFixed(0)})`
                      : undefined
                  }
                >
                  {fmtVal(r.avg_ttft_ms)}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {fmtVal(r.p50_ttft_ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtVal(r.p95_ttft_ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtVal(r.p99_ttft_ms)}
                </TableCell>

                {/* Avg Latency with hover tooltip */}
                <TableCell
                  className="text-right tabular-nums"
                  title={`\u00b1${r.std_latency_ms.toFixed(1)} (${r.min_latency_ms.toFixed(0)}~${r.max_latency_ms.toFixed(0)})`}
                >
                  {fmtVal(r.avg_latency_ms)}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {fmtVal(r.avg_tps)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtPct(r.error_rate)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
