import React, { useMemo } from "react";
import type { BenchmarkResult } from "@/types/benchmark";
import ChartCard from "./ChartCard";

interface HeatmapChartProps {
  results: BenchmarkResult[];
}

/** Green -> Yellow -> Red smooth interpolation */
function interpolateColor(value: number, min: number, max: number): string {
  if (max === min) return "rgb(134,209,134)";
  const ratio = (value - min) / (max - min);

  let r: number, g: number, b: number;
  if (ratio < 0.5) {
    const t = ratio * 2;
    r = Math.round(76 + t * (245 - 76));
    g = Math.round(209 + t * (196 - 209));
    b = Math.round(76 + t * (15 - 76));
  } else {
    const t = (ratio - 0.5) * 2;
    r = Math.round(245 + t * (239 - 245));
    g = Math.round(196 - t * (196 - 68));
    b = Math.round(15 + t * (68 - 15));
  }

  return `rgb(${r},${g},${b})`;
}

/** Return relative luminance to decide text color */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function textColorForBg(bgColor: string): string {
  const match = bgColor.match(/\d+/g);
  if (!match || match.length < 3) return "#1f2937";
  const [r, g, b] = match.map(Number);
  return luminance(r, g, b) > 0.4 ? "#1f2937" : "#ffffff";
}

/** Truncate long strings */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "\u2026" : str;
}

export default function HeatmapChart({ results }: HeatmapChartProps) {
  const hasData = results.some((r) => r.avg_ttft_ms > 0);

  const { regions, rowLabels, grid, allValues } = useMemo(() => {
    const regionSet = [...new Set(results.map((r) => r.region))];
    const labelMap = new Map<string, Map<string, number>>();

    results.forEach((r) => {
      const effort = r.reasoning_effort || "";
      const rowLabel = effort
        ? `${r.model} (${r.api_type}) [${effort}]`
        : `${r.model} (${r.api_type})`;
      if (!labelMap.has(rowLabel)) {
        labelMap.set(rowLabel, new Map());
      }
      labelMap.get(rowLabel)!.set(r.region, r.avg_ttft_ms);
    });

    const labels = [...labelMap.keys()];
    const vals: number[] = [];
    const gridData = labels.map((label) => {
      const regionVals = labelMap.get(label)!;
      return regionSet.map((region) => {
        const v = regionVals.get(region) ?? 0;
        if (v > 0) vals.push(v);
        return v;
      });
    });

    return { regions: regionSet, rowLabels: labels, grid: gridData, allValues: vals };
  }, [results]);

  if (!hasData) return null;

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  /* color legend stops */
  const legendStops = 5;
  const legendValues = Array.from({ length: legendStops }, (_, i) => {
    const ratio = i / (legendStops - 1);
    return Math.round(minVal + ratio * (maxVal - minVal));
  });

  return (
    <ChartCard title="TTFT Heatmap">
      <div className="overflow-x-auto">
        {/* Grid of cells */}
        <div className="flex flex-col gap-1.5">
          {rowLabels.map((label, rowIdx) => (
            <div key={label} className="flex items-center gap-1.5">
              {/* Row label */}
              <div
                className="shrink-0 w-48 text-xs font-medium text-gray-600 text-left truncate pr-2"
                title={label}
              >
                {truncate(label, 32)}
              </div>
              {/* Cells */}
              {grid[rowIdx].map((value, colIdx) => {
                const bgColor =
                  value > 0
                    ? interpolateColor(value, minVal, maxVal)
                    : "#f3f4f6";
                const txtColor = value > 0 ? textColorForBg(bgColor) : "#9ca3af";
                return (
                  <div
                    key={regions[colIdx]}
                    className="flex items-center justify-center rounded-lg font-mono text-xs font-bold"
                    style={{
                      minWidth: 80,
                      height: 48,
                      backgroundColor: bgColor,
                      color: txtColor,
                    }}
                  >
                    {value > 0 ? `${Math.round(value)} ms` : "-"}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Column labels row */}
          <div className="flex items-start gap-1.5 mt-1">
            <div className="shrink-0 w-48" />
            {regions.map((region) => (
              <div
                key={region}
                className="text-xs text-gray-500 font-medium"
                style={{
                  minWidth: 80,
                  transform: "rotate(-45deg)",
                  transformOrigin: "top left",
                  whiteSpace: "nowrap",
                  marginTop: 4,
                  marginLeft: 16,
                }}
              >
                {region}
              </div>
            ))}
          </div>
        </div>

        {/* Color legend bar */}
        <div className="mt-10 flex items-center gap-2 justify-center">
          <span className="text-xs text-gray-400">Low</span>
          <div className="flex h-4 rounded-full overflow-hidden">
            {legendValues.map((val, i) => (
              <div
                key={i}
                style={{
                  width: 48,
                  backgroundColor: interpolateColor(val, minVal, maxVal),
                }}
              />
            ))}
          </div>
          <span className="text-xs text-gray-400">High</span>
          <span className="text-xs text-gray-400 ml-2">
            ({Math.round(minVal)} - {Math.round(maxVal)} ms)
          </span>
        </div>
      </div>
    </ChartCard>
  );
}
