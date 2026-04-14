"use client";

import { useBenchmark } from "@/hooks/useBenchmark";
import { ConfigPanel } from "@/components/config/ConfigPanel";
import { RunningPanel } from "@/components/running/RunningPanel";
import { ResultsPanel } from "@/components/results/ResultsPanel";

export default function Home() {
  const benchmark = useBenchmark();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8E4F0]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#8661C5] to-[#0078D4] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#2D2B3A] tracking-tight">Azure OpenAI Latency Benchmark</h1>
              <p className="text-[#7A7490] text-xs">Cross-region performance testing</p>
            </div>
          </div>
          {benchmark.phase !== "config" && (
            <button
              onClick={benchmark.reset}
              className="text-sm px-4 py-1.5 rounded-lg border border-[#E8E4F0] text-[#7A7490] hover:bg-[#F3F0F9] hover:text-[#8661C5] transition-colors font-medium"
            >
              New Test
            </button>
          )}
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
