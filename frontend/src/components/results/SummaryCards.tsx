"use client";

import { useMemo } from "react";
import type { BenchmarkResult } from "@/types/benchmark";
import {
  Activity,
  Clock,
  Zap,
  Globe,
  Trophy,
  AlertTriangle,
  Database,
  Timer,
} from "lucide-react";

interface SummaryCardsProps {
  results: BenchmarkResult[];
}

function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

export function SummaryCards({ results }: SummaryCardsProps) {
  const summary = useMemo(() => {
    if (results.length === 0) {
      return null;
    }

    const totalTests = results.length;
    const rounds = new Set(results.map((r) => r.round)).size;

    // Avg TTFT — skip entries where avg_ttft_ms is 0 or null-ish
    const ttftResults = results.filter((r) => r.avg_ttft_ms > 0);
    const avgTTFT =
      ttftResults.length > 0
        ? ttftResults.reduce((sum, r) => sum + r.avg_ttft_ms, 0) /
          ttftResults.length
        : null;

    // Avg Latency
    const avgLatency =
      results.reduce((sum, r) => sum + r.avg_latency_ms, 0) / totalTests;

    // Avg TPS
    const avgTPS =
      results.reduce((sum, r) => sum + r.avg_tps, 0) / totalTests;

    // Fastest region by TTFT
    let fastestRegion: string | null = null;
    if (ttftResults.length > 0) {
      const regionTTFT: Record<string, { sum: number; count: number }> = {};
      for (const r of ttftResults) {
        if (!regionTTFT[r.region]) {
          regionTTFT[r.region] = { sum: 0, count: 0 };
        }
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

    // Highest TPS model
    const modelTPS: Record<string, { sum: number; count: number }> = {};
    for (const r of results) {
      if (!modelTPS[r.model]) {
        modelTPS[r.model] = { sum: 0, count: 0 };
      }
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

    // Cache hit rate
    const cacheResults = results.filter((r) => r.cache != null);
    const cacheHitRate =
      cacheResults.length > 0
        ? cacheResults.reduce((sum, r) => sum + r.cache!.hit_rate, 0) /
          cacheResults.length
        : null;

    // Error count
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

  if (!summary) {
    return null;
  }

  const cards: StatCard[] = [
    {
      label: "Total Tests",
      value:
        summary.rounds > 1
          ? `${summary.totalTests} (${summary.rounds} rounds)`
          : `${summary.totalTests}`,
      icon: <Activity className="h-5 w-5" />,
      iconBg: "bg-[var(--info-light)]",
      iconColor: "text-[var(--info)]",
    },
    ...(summary.avgTTFT != null
      ? [
          {
            label: "Avg TTFT (ms)",
            value: fmt(summary.avgTTFT),
            icon: <Timer className="h-5 w-5" />,
            iconBg: "bg-[var(--success-light)]",
            iconColor: "text-[var(--success)]",
          },
        ]
      : []),
    {
      label: "Avg Latency (ms)",
      value: fmt(summary.avgLatency),
      icon: <Clock className="h-5 w-5" />,
      iconBg: "bg-[var(--warning-light)]",
      iconColor: "text-[var(--warning)]",
    },
    {
      label: "Avg TPS",
      value: fmt(summary.avgTPS),
      icon: <Zap className="h-5 w-5" />,
      iconBg: "bg-[#F3F0F9]",
      iconColor: "text-[#8661C5]",
    },
    {
      label: "Fastest Region",
      value: summary.fastestRegion ?? "N/A",
      icon: <Globe className="h-5 w-5" />,
      iconBg: "bg-[var(--success-light)]",
      iconColor: "text-[var(--success)]",
    },
    {
      label: "Highest TPS Model",
      value: summary.highestTPSModel ?? "N/A",
      icon: <Trophy className="h-5 w-5" />,
      iconBg: "bg-[var(--warning-light)]",
      iconColor: "text-[var(--warning)]",
    },
    {
      label: "Cache Hit Rate",
      value:
        summary.cacheHitRate != null
          ? `${(summary.cacheHitRate * 100).toFixed(1)}%`
          : "N/A",
      icon: <Database className="h-5 w-5" />,
      iconBg: "bg-[var(--info-light)]",
      iconColor: "text-[var(--info)]",
    },
    {
      label: "Tests with Errors",
      value: `${summary.testsWithErrors}`,
      icon: <AlertTriangle className="h-5 w-5" />,
      iconBg: "bg-[var(--error-light)]",
      iconColor: "text-[var(--error)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white shadow-sm rounded-xl border border-[#E8E4F0] p-5 flex items-start gap-4"
        >
          {/* Icon avatar */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg} ${card.iconColor}`}
          >
            {card.icon}
          </div>

          {/* Content: 3-tier hierarchy */}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground opacity-70 truncate">
              {card.label}
            </p>
            <p className="text-2xl font-bold tabular-nums leading-tight mt-0.5">
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
