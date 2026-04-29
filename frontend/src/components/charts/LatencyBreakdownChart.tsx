import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { Props as LabelProps } from "recharts/types/component/Label";
import type { BenchmarkResult } from "@/types/benchmark";
import ChartCard from "./ChartCard";

interface LatencyBreakdownChartProps {
  results: BenchmarkResult[];
}

// Ordered along the real request timeline, light → dark, so the stacked
// bar reads left-to-right as the call progresses. DNS / TCP / TLS come
// from the raw-socket baseline probe (probe_dns_ms / probe_tcp_ms /
// probe_tls_ms) — per-call dns/tcp/tls is zero on reused connections
// and would hide the physical network cost.
const SEGMENT_COLORS: Record<string, string> = {
  DNS: "#B9E3F2",
  TCP: "#8DC8E8",
  TLS: "#5EACD8",
  "Backend Processing": "#C5B4E3",
  "First Token Delay": "#E8C170",
  "Token Generation": "#5BBF8A",
};

const SEGMENT_KEYS = Object.keys(SEGMENT_COLORS) as (keyof typeof SEGMENT_COLORS)[];

/* ---- tooltip types ---- */
interface TooltipPayloadEntry {
  name: string;
  value: string | number;
  color: string;
}

/* ---- custom tooltip showing each segment ---- */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card text-card-foreground shadow-lg rounded-lg px-3 py-2 border border-[var(--border)]">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value} ms
        </p>
      ))}
    </div>
  );
}

/** Only show label when value > 500 */
function renderSegmentLabel(props: LabelProps) {
  const { x, y, width, value } = props as { x: number; y: number; width: number; value: number | string };
  if (typeof value !== "number" || value <= 500) return null;
  return (
    <text
      x={x + width / 2}
      y={y + 14}
      textAnchor="middle"
      fontSize={10}
      fill="#fff"
      fontWeight={500}
    >
      {value.toLocaleString()}
    </text>
  );
}

export default function LatencyBreakdownChart({ results }: LatencyBreakdownChartProps) {
  const hasData = results.some((r) => r.avg_ttfb_ms > 0);

  const chartData = useMemo(() => {
    return results.map((r) => {
      const effort = r.reasoning_effort || "";
      const label = effort
        ? `${r.region} / ${r.model} (${effort})`
        : `${r.region} / ${r.model}`;
      const firstTokenDelay = Math.max(0, r.avg_ttft_ms - r.avg_ttfb_ms);
      // Prefer the explicit probe breakdown; fall back to the combined
      // network_probe_ms in the TCP column if a breakdown wasn't recorded
      // (e.g. older runs, or probe failed and only total_ms is present).
      const hasBreakdown =
        r.probe_dns_ms > 0 || r.probe_tcp_ms > 0 || r.probe_tls_ms > 0;
      const fallbackTcp = hasBreakdown ? 0 : r.network_probe_ms;
      return {
        label,
        DNS: Math.round(r.probe_dns_ms || 0),
        TCP: Math.round(r.probe_tcp_ms || fallbackTcp),
        TLS: Math.round(r.probe_tls_ms || 0),
        "Backend Processing": Math.round(r.avg_backend_est_ms),
        "First Token Delay": Math.round(firstTokenDelay),
        "Token Generation": Math.round(r.avg_token_gen_ms),
      };
    });
  }, [results]);

  if (!hasData) return null;

  return (
    <ChartCard title="Latency Breakdown">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={chartData}
          margin={{ top: 30, right: 30, left: 20, bottom: 60 }}
          barSize={40}
        >
          <CartesianGrid strokeDasharray="7 7" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            angle={-25}
            textAnchor="end"
            interval={0}
            height={80}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
          />
          <YAxis
            unit=" ms"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#9CA3AF" }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12 }}
          />
          {SEGMENT_KEYS.map((segment, idx) => {
            // Only the top segment gets rounded top corners
            const isLast = idx === SEGMENT_KEYS.length - 1;
            return (
              <Bar
                key={segment}
                dataKey={segment}
                stackId="stack"
                fill={SEGMENT_COLORS[segment]}
                radius={isLast ? [7, 7, 0, 0] : [0, 0, 0, 0]}
              >
                <LabelList dataKey={segment} content={renderSegmentLabel} />
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
