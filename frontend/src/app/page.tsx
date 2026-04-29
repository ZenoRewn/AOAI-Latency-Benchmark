"use client";

import { useBenchmark } from "@/hooks/useBenchmark";
import { ConfigPanel } from "@/components/config/ConfigPanel";
import { RunningPanel } from "@/components/running/RunningPanel";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function Home() {
  const benchmark = useBenchmark();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[color-mix(in_srgb,var(--background)_78%,transparent)] backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="brand-shimmer text-2xl md:text-[1.7rem] font-bold leading-none truncate">
              Azure OpenAI Latency Benchmark
            </h1>
            <span className="hidden sm:inline-flex status-pill info shrink-0">
              cross-region
            </span>
          </div>
          <div className="flex items-center gap-2">
            {benchmark.phase !== "config" && (
              <button
                onClick={benchmark.reset}
                className="text-sm px-4 py-1.5 rounded-full border border-[var(--border)] text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--primary)] hover:border-[color-mix(in_srgb,var(--primary)_35%,transparent)] transition-colors font-medium"
              >
                New Test
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {benchmark.phase === "config" && (
          <ConfigPanel onStart={benchmark.start} />
        )}

        {benchmark.phase === "running" && (
          <RunningPanel
            progress={benchmark.progress}
            liveResults={benchmark.liveResults}
            isMonitor={benchmark.isMonitor}
            onStop={benchmark.stop}
          />
        )}

        {benchmark.phase === "results" && (
          <ResultsPanel
            results={benchmark.finalResults}
            runId={benchmark.runId}
            onNewTest={benchmark.reset}
          />
        )}
      </main>
    </div>
  );
}
