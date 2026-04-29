"use client";

import { useCallback, useMemo } from "react";
import type { BenchmarkResult } from "@/types/benchmark";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { cn } from "@/lib/utils";

interface SummaryCardsProps {
  results: BenchmarkResult[];
}

interface StatCard {
  key: string;
  label: string;
  numeric?: number;
  decimals?: number;
  suffix?: string;
  text?: string;
  /** CSS color for the big value (one of the --display-* tokens) */
  color?: string;
  highlight?: boolean;
}

export function SummaryCards({ results }: SummaryCardsProps) {
  const summary = useMemo(() => {
    if (results.length === 0) return null;

    const totalTests = results.length;
    const rounds = new Set(results.map((r) => r.round)).size;

    const ttftResults = results.filter((r) => r.avg_ttft_ms > 0);
    const avgTTFT =
      ttftResults.length > 0
        ? ttftResults.reduce((sum, r) => sum + r.avg_ttft_ms, 0) /
          ttftResults.length
        : null;

    const avgLatency =
      results.reduce((sum, r) => sum + r.avg_latency_ms, 0) / totalTests;

    const avgTPS =
      results.reduce((sum, r) => sum + r.avg_tps, 0) / totalTests;

    let fastestRegion: string | null = null;
    if (ttftResults.length > 0) {
      const regionTTFT: Record<string, { sum: number; count: number }> = {};
      for (const r of ttftResults) {
        if (!regionTTFT[r.region]) regionTTFT[r.region] = { sum: 0, count: 0 };
        regionTTFT[r.region].sum += r.avg_ttft_ms;
        regionTTFT[r.region].count += 1;
      }
      let minAvg = Infinity;
      for (const [region, data] of Object.entries(regionTTFT)) {
        const avg = data.sum / data.count;
        if (avg < minAvg) {
          minAvg = avg;
          fastestRegion = region;
        }
      }
    }

    const modelTPS: Record<string, { sum: number; count: number }> = {};
    for (const r of results) {
      if (!modelTPS[r.model]) modelTPS[r.model] = { sum: 0, count: 0 };
      modelTPS[r.model].sum += r.avg_tps;
      modelTPS[r.model].count += 1;
    }
    let highestTPSModel: string | null = null;
    let maxTPS = -Infinity;
    for (const [model, data] of Object.entries(modelTPS)) {
      const avg = data.sum / data.count;
      if (avg > maxTPS) {
        maxTPS = avg;
        highestTPSModel = model;
      }
    }

    const cacheResults = results.filter((r) => r.cache != null);
    const cacheHitRate =
      cacheResults.length > 0
        ? cacheResults.reduce((sum, r) => sum + r.cache!.hit_rate, 0) /
          cacheResults.length
        : null;

    const testsWithErrors = results.filter((r) => r.error_rate > 0).length;

    return {
      totalTests,
      rounds,
      avgTTFT,
      avgLatency,
      avgTPS,
      fastestRegion,
      highestTPSModel,
      cacheHitRate,
      testsWithErrors,
    };
  }, [results]);

  if (!summary) return null;

  const cards: StatCard[] = [
    {
      key: "total",
      label:
        summary.rounds > 1 ? `Total Tests · ${summary.rounds}r` : "Total Tests",
      numeric: summary.totalTests,
      decimals: 0,
      color: "var(--display-blue)",
    },
    ...(summary.avgTTFT != null
      ? [
          {
            key: "ttft",
            label: "Avg TTFT (ms)",
            numeric: summary.avgTTFT,
            decimals: 1,
            color: "var(--display-green)",
          } satisfies StatCard,
        ]
      : []),
    {
      key: "latency",
      label: "Avg Latency (ms)",
      numeric: summary.avgLatency,
      decimals: 1,
      color: "var(--display-amber)",
    },
    {
      key: "tps",
      label: "Avg TPS",
      numeric: summary.avgTPS,
      decimals: 1,
      color: "var(--display-violet)",
    },
    {
      key: "region",
      label: "Fastest Region",
      text: summary.fastestRegion ?? "N/A",
      color: "var(--display-green)",
      highlight: !!summary.fastestRegion,
    },
    {
      key: "topModel",
      label: "Highest TPS Model",
      text: summary.highestTPSModel ?? "N/A",
      color: "var(--display-cyan)",
      highlight: !!summary.highestTPSModel,
    },
    {
      key: "cache",
      label: "Cache Hit Rate",
      numeric: summary.cacheHitRate != null ? summary.cacheHitRate * 100 : undefined,
      decimals: 1,
      suffix: "%",
      text: summary.cacheHitRate == null ? "N/A" : undefined,
      color: "var(--display-cyan)",
    },
    {
      key: "errors",
      label: "Tests with Errors",
      numeric: summary.testsWithErrors,
      decimals: 0,
      color:
        summary.testsWithErrors > 0
          ? "var(--display-rose)"
          : "var(--foreground)",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map((card, idx) => (
        <GlowStatCard key={card.key} card={card} index={idx} />
      ))}
    </div>
  );
}

function GlowStatCard({ card, index }: { card: StatCard; index: number }) {
  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }, []);

  const handleLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--mx", "50%");
    e.currentTarget.style.setProperty("--my", "50%");
  }, []);

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        "surface-glow rounded-xl px-4 py-3.5 backdrop-blur-sm"
      )}
    >
      <p className="stat-label truncate">{card.label}</p>
      <p
        className="mt-1.5 stat-value text-[1.6rem] sm:text-[1.75rem] truncate"
        style={{ color: card.color ?? "var(--foreground)" }}
      >
        {card.numeric != null ? (
          <NumberTicker
            value={card.numeric}
            decimals={card.decimals ?? 0}
            suffix={card.suffix ?? ""}
            delay={index * 0.05}
          />
        ) : (
          <span>{card.text}</span>
        )}
      </p>
    </div>
  );
}
