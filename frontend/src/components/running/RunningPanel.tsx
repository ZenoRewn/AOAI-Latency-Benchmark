"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShineBorder } from "@/components/magicui/shine-border";
import type { SSECallResult } from "@/types/benchmark";

interface Progress {
  current: number;
  total: number;
  message: string;
}

interface RunningPanelProps {
  progress: Progress;
  liveResults: SSECallResult[];
  isMonitor: boolean;
  onStop: () => void;
}

export function RunningPanel({
  progress,
  liveResults,
  isMonitor,
  onStop,
}: RunningPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new results arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [liveResults.length]);

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  const copyRequestId = useCallback((fullId: string) => {
    navigator.clipboard.writeText(fullId).catch(() => {
      // silently ignore clipboard errors
    });
  }, []);

  const isActive = pct < 100;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress card */}
      <div className="relative bg-card shadow-sm rounded-xl p-5 border border-[var(--border)] overflow-hidden">
        {isActive && (
          <ShineBorder
            borderWidth={1.5}
            duration={6}
            shineColor={["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"]}
          />
        )}
        <div className="flex flex-col gap-3 relative">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`status-pill ${isActive ? "info" : "ok"} shrink-0`}>
                {isActive ? "Running" : "Done"}
              </span>
              <span className="text-sm text-muted-foreground font-medium truncate">
                {progress.message}
              </span>
            </div>
            <span className="stat-value text-base text-foreground">
              <span style={{ color: "var(--display-blue)" }}>
                {progress.current}
              </span>
              <span className="text-muted-foreground font-normal"> / </span>
              {progress.total}
              <span className="ml-2 text-xs text-muted-foreground font-medium">
                ({pct}%)
              </span>
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--secondary)] border border-[var(--border)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-4)] transition-all duration-300 ease-out shadow-[0_0_12px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stop button for monitor mode */}
        {isMonitor && (
          <div className="flex justify-end mt-4 relative">
            <Button variant="destructive" size="sm" className="rounded-lg" onClick={onStop}>
              Stop Monitor
            </Button>
          </div>
        )}
      </div>

      {/* Live results table */}
      <div className="bg-card shadow-sm rounded-xl border border-[var(--border)] overflow-hidden">
        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-auto"
        >
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--card)_95%,transparent)] backdrop-blur-sm">
              <TableRow className="border-b border-border/60">
                <TableHead className="font-semibold">Round</TableHead>
                <TableHead className="font-semibold">Region</TableHead>
                <TableHead className="font-semibold">Model</TableHead>
                <TableHead className="font-semibold">API</TableHead>
                <TableHead className="font-semibold">Reasoning</TableHead>
                <TableHead className="font-semibold">Iter</TableHead>
                <TableHead className="text-right font-semibold">TTFT(ms)</TableHead>
                <TableHead className="text-right font-semibold">Latency(ms)</TableHead>
                <TableHead className="text-right font-semibold">TPS</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Request ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveResults.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Waiting for results...
                  </TableCell>
                </TableRow>
              ) : (
                liveResults.map((r, idx) => {
                  const hasError = !!r.metrics.error;
                  return (
                    <TableRow
                      key={idx}
                      className={cn(
                        hasError
                          ? "alert-bar bg-[color-mix(in_srgb,var(--error)_10%,transparent)]"
                          : idx % 2 === 0
                            ? "bg-transparent"
                            : "bg-[var(--secondary)]/40",
                        "transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]",
                        "animate-in fade-in slide-in-from-top-1 duration-200"
                      )}
                    >
                      <TableCell>{r.round}</TableCell>
                      <TableCell>{r.region}</TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {r.model}
                      </TableCell>
                      <TableCell>{r.api_type}</TableCell>
                      <TableCell>{r.reasoning_effort || "-"}</TableCell>
                      <TableCell>{r.iteration}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.metrics.ttft_ms != null
                          ? r.metrics.ttft_ms.toFixed(0)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.metrics.total_latency_ms.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.metrics.tokens_per_second.toFixed(1)}
                      </TableCell>
                      <TableCell>
                        {hasError ? (
                          <span className="status-pill err" title={r.metrics.error!}>
                            Error
                          </span>
                        ) : (
                          <span className="status-pill ok">OK</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.metrics.request_id ? (
                          <button
                            type="button"
                            onClick={() => copyRequestId(r.metrics.request_id)}
                            className="cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                            title={`Click to copy: ${r.metrics.request_id}`}
                          >
                            {r.metrics.request_id.slice(0, 8)}
                          </button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
