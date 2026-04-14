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

  return (
    <div className="flex flex-col gap-6">
      {/* Progress card */}
      <div className="bg-white shadow-sm rounded-xl p-5 border border-[#E8E4F0]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">
              {progress.message}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {progress.current} / {progress.total} ({pct}%)
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8661C5] to-[#0078D4] transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stop button for monitor mode */}
        {isMonitor && (
          <div className="flex justify-end mt-4">
            <Button variant="destructive" size="sm" className="rounded-lg" onClick={onStop}>
              Stop Monitor
            </Button>
          </div>
        )}
      </div>

      {/* Live results table */}
      <div className="bg-white shadow-sm rounded-xl border border-[#E8E4F0] overflow-hidden">
        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-auto"
        >
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
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
                          ? "bg-red-50/60"
                          : idx % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50/50",
                        "transition-colors hover:bg-[#F3F0F9]/60"
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
                          <span
                            className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                            title={r.metrics.error!}
                          >
                            Error
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            OK
                          </span>
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
