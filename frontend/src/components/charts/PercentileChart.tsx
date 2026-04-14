import React, { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { BenchmarkResult } from "@/types/benchmark";
import ChartCard from "./ChartCard";

interface PercentileChartProps {
  results: BenchmarkResult[];
}

/* ---- tooltip types ---- */
interface TooltipPayloadEntry {
  name: string;
  value: string | number;
  color: string;
}

/* ---- custom tooltip showing all 4 values ---- */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-lg rounded-lg px-3 py-2 border border-gray-100">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value} ms
        </p>
      ))}
    </div>
  );
}

export default function PercentileChart({ results }: PercentileChartProps) {
  const hasData = results.some((r) => r.p50_ttft_ms > 0);

  const chartData = useMemo(() => {
    return results.map((r) => {
      const effort = r.reasoning_effort || "";
      const label = effort
        ? `${r.region} / ${r.model} (${effort})`
        : `${r.region} / ${r.model}`;
      return {
        label,
        P50: Math.round(r.p50_ttft_ms),
        P95: Math.round(r.p95_ttft_ms),
        P99: Math.round(r.p99_ttft_ms),
        "Avg TTFT": Math.round(r.avg_ttft_ms),
      };
    });
  }, [results]);

  if (!hasData) return null;

  return (
    <ChartCard title="TTFT Percentiles (P50 / P95 / P99) with Avg">
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart
          data={chartData}
          margin={{ top: 30, right: 30, left: 20, bottom: 60 }}
          barSize={28}
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
          <Bar dataKey="P50" fill="#8661C5" radius={[7, 7, 0, 0]}>
            <LabelList dataKey="P50" position="top" fontSize={11} fill="#7A7490" />
          </Bar>
          <Bar dataKey="P95" fill="#C5B4E3" radius={[7, 7, 0, 0]}>
            <LabelList dataKey="P95" position="top" fontSize={11} fill="#7A7490" />
          </Bar>
          <Bar dataKey="P99" fill="#E8C170" radius={[7, 7, 0, 0]}>
            <LabelList dataKey="P99" position="top" fontSize={11} fill="#7A7490" />
          </Bar>
          <Scatter
            dataKey="Avg TTFT"
            fill="#0078D4"
            shape="diamond"
            legendType="diamond"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
