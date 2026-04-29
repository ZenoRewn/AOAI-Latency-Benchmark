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
  Cell,
} from "recharts";
import type { BenchmarkResult } from "@/types/benchmark";
import { CHART_COLORS } from "@/lib/constants";
import ChartCard from "./ChartCard";

interface TPSChartProps {
  results: BenchmarkResult[];
}

/* ---- tooltip types ---- */
interface TooltipPayloadEntry {
  name: string;
  value: string | number;
  color: string;
}

/* ---- shared custom tooltip ---- */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card text-card-foreground shadow-lg rounded-lg px-3 py-2 border border-[var(--border)]">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value} t/s
        </p>
      ))}
    </div>
  );
}

function getModelKeys(results: BenchmarkResult[]) {
  const efforts = new Set(results.map((r) => r.reasoning_effort || ""));
  const hasMultiEffort = efforts.size > 1;
  const keys = [
    ...new Set(
      results.map((r) => {
        const e = r.reasoning_effort || "";
        return hasMultiEffort && e ? `${r.model} (${e})` : r.model;
      })
    ),
  ];
  return { keys, hasMultiEffort };
}

/** Find the model key with the HIGHEST overall average TPS (best performer) */
function findBestKey(
  chartData: Record<string, string | number>[],
  keys: string[]
): string | null {
  let bestKey: string | null = null;
  let bestAvg = -Infinity;
  for (const key of keys) {
    let sum = 0;
    let count = 0;
    for (const row of chartData) {
      const v = row[key];
      if (typeof v === "number" && v > 0) {
        sum += v;
        count++;
      }
    }
    if (count > 0 && sum / count > bestAvg) {
      bestAvg = sum / count;
      bestKey = key;
    }
  }
  return bestKey;
}

export default function TPSChart({ results }: TPSChartProps) {
  const hasData = results.some((r) => r.avg_tps > 0);

  const { keys, hasMultiEffort } = useMemo(() => getModelKeys(results), [results]);

  const chartData = useMemo(() => {
    const regions = [...new Set(results.map((r) => r.region))];
    return regions.map((region) => {
      const entry: Record<string, string | number> = { region };
      results
        .filter((r) => r.region === region)
        .forEach((r) => {
          const e = r.reasoning_effort || "";
          const key = hasMultiEffort && e ? `${r.model} (${e})` : r.model;
          entry[key] = Math.round(r.avg_tps * 10) / 10;
        });
      return entry;
    });
  }, [results, hasMultiEffort]);

  const bestKey = useMemo(() => findBestKey(chartData, keys), [chartData, keys]);

  if (!hasData) return null;

  const barSize = keys.length > 1 ? 28 : 40;

  return (
    <ChartCard title="Tokens Per Second by Region">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={chartData}
          margin={{ top: 30, right: 30, left: 20, bottom: 5 }}
          barSize={barSize}
        >
          <CartesianGrid strokeDasharray="7 7" stroke="#f0f0f0" />
          <XAxis
            dataKey="region"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#9CA3AF" }}
          />
          <YAxis
            unit=" t/s"
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
          {keys.map((key, i) => {
            const singleModel = keys.length === 1;
            const color =
              key === bestKey
                ? "#8661C5"
                : CHART_COLORS[i % CHART_COLORS.length];
            return (
              <Bar key={key} dataKey={key} fill={color} radius={[7, 7, 0, 0]}>
                {singleModel &&
                  chartData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    />
                  ))}
                <LabelList
                  dataKey={key}
                  position="top"
                  fontSize={11}
                  fill="#6B7280"
                />
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
