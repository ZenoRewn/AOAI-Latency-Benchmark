"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ChartCard from "@/components/charts/ChartCard";
import type { BenchmarkResult } from "@/types/benchmark";

interface StageTableProps {
  results: BenchmarkResult[];
}

function fmtMs(value: number | null | undefined, decimals = 0): string {
  if (value == null || value === 0 || Number.isNaN(value)) return "–";
  return value.toFixed(decimals);
}

function fmtPct(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${(value * 100).toFixed(0)}%`;
}

export function StageTable({ results }: StageTableProps) {
  const rows = useMemo(() => {
    return results.map((r) => {
      const firstTokenDelay = Math.max(0, r.avg_ttft_ms - r.avg_ttfb_ms);
      const hasBreakdown =
        r.probe_dns_ms > 0 || r.probe_tcp_ms > 0 || r.probe_tls_ms > 0;
      const dns = r.probe_dns_ms || 0;
      const tcp = r.probe_tcp_ms || (hasBreakdown ? 0 : r.network_probe_ms);
      const tls = r.probe_tls_ms || 0;
      const backend = r.avg_backend_est_ms || 0;
      const tokenGen = r.avg_token_gen_ms || 0;
      const total = r.avg_latency_ms || dns + tcp + tls + backend + firstTokenDelay + tokenGen;
      return {
        key: `${r.round}-${r.region}-${r.model}-${r.api_type}-${r.reasoning_effort}`,
        round: r.round,
        region: r.region,
        model: r.model,
        effort: r.reasoning_effort,
        dns,
        tcp,
        tls,
        ttfb: r.avg_ttfb_ms || 0,
        backend,
        firstTokenDelay,
        tokenGen,
        total,
      };
    });
  }, [results]);

  if (!rows.some((r) => r.total > 0)) return null;

  return (
    <ChartCard
      title="Stage Breakdown"
      subtitle="Per-call average of each pipeline stage in milliseconds. DNS/TCP/TLS come from the raw-socket baseline probe; Backend / First Token / Token Gen from the live call."
    >
      <div className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Region / Model</TableHead>
              <TableHead className="text-right font-mono">DNS</TableHead>
              <TableHead className="text-right font-mono">TCP</TableHead>
              <TableHead className="text-right font-mono">TLS</TableHead>
              <TableHead className="text-right font-mono">TTFB</TableHead>
              <TableHead className="text-right font-mono">Backend</TableHead>
              <TableHead className="text-right font-mono">1st Tok Δ</TableHead>
              <TableHead className="text-right font-mono">Tok Gen</TableHead>
              <TableHead className="text-right font-mono font-semibold">E2E</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const pct = (v: number) => (r.total > 0 ? v / r.total : 0);
              return (
                <TableRow key={r.key}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.region}</span>
                      <span className="text-muted-foreground text-[11px]">
                        {r.model}
                        {r.effort ? ` · ${r.effort}` : ""}
                        {r.round > 1 ? ` · R${r.round}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <StageCell value={r.dns} pct={pct(r.dns)} tone="muted" />
                  <StageCell value={r.tcp} pct={pct(r.tcp)} tone="muted" />
                  <StageCell value={r.tls} pct={pct(r.tls)} tone="muted" />
                  <StageCell value={r.ttfb} pct={pct(r.ttfb)} tone="neutral" />
                  <StageCell value={r.backend} pct={pct(r.backend)} tone="accent" />
                  <StageCell value={r.firstTokenDelay} pct={pct(r.firstTokenDelay)} tone="warn" />
                  <StageCell value={r.tokenGen} pct={pct(r.tokenGen)} tone="success" />
                  <TableCell className="text-right font-mono font-semibold">
                    {fmtMs(r.total, 0)}
                    <span className="text-muted-foreground text-[10px] ml-1">ms</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </ChartCard>
  );
}

function StageCell({
  value,
  pct,
  tone,
}: {
  value: number;
  pct: number;
  tone: "muted" | "neutral" | "accent" | "warn" | "success";
}) {
  const toneClass = {
    muted: "text-muted-foreground",
    neutral: "text-foreground",
    accent: "text-[#C5B4E3]",
    warn: "text-[#E8C170]",
    success: "text-[#5BBF8A]",
  }[tone];

  return (
    <TableCell className="text-right font-mono">
      <span className={toneClass}>{fmtMs(value, 0)}</span>
      <span className="text-muted-foreground text-[10px] ml-1">{fmtPct(pct)}</span>
    </TableCell>
  );
}
