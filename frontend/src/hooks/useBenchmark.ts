"use client";

import { useState, useCallback, useRef } from "react";
import { apiPost, sseUrl } from "@/lib/api";
import type {
  BenchmarkConfig,
  BenchmarkResult,
  SSECallResult,
  SSEEvent,
  SSEProbe,
} from "@/types/benchmark";

export type BenchmarkPhase = "config" | "running" | "results";

export interface BenchmarkProgress {
  current: number;
  total: number;
  message: string;
}

export type ProbeResult = SSEProbe["probe"];

interface UseBenchmarkReturn {
  phase: BenchmarkPhase;
  progress: BenchmarkProgress;
  liveResults: SSECallResult[];
  finalResults: BenchmarkResult[];
  probes: Record<string, ProbeResult>;
  runId: string | null;
  error: string | null;
  isMonitor: boolean;
  start: (config: BenchmarkConfig) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export function useBenchmark(): UseBenchmarkReturn {
  const [phase, setPhase] = useState<BenchmarkPhase>("config");
  const [progress, setProgress] = useState<BenchmarkProgress>({
    current: 0,
    total: 0,
    message: "",
  });
  const [liveResults, setLiveResults] = useState<SSECallResult[]>([]);
  const [finalResults, setFinalResults] = useState<BenchmarkResult[]>([]);
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMonitor, setIsMonitor] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "started":
        setProgress({
          current: 0,
          total: event.total_calls,
          message: `Starting benchmark: ${event.total_tasks} tasks, ${event.total_calls} total calls`,
        });
        break;

      case "warmup":
        setProgress((prev) => ({
          ...prev,
          message: event.message,
        }));
        break;

      case "progress":
        setProgress({
          current: event.current,
          total: event.total,
          message: event.message,
        });
        break;

      case "call_result":
        setProgress((prev) => ({
          ...prev,
          current: event.current,
          total: event.total,
        }));
        setLiveResults((prev) => [...prev, event]);
        break;

      case "result":
        setFinalResults((prev) => [...prev, event.data]);
        break;

      case "probe":
        setProbes((prev) => ({
          ...prev,
          [event.region]: event.probe,
        }));
        break;

      case "monitor_point":
        // Treat monitor_point like a call_result for live tracking
        setLiveResults((prev) => [
          ...prev,
          {
            type: "call_result",
            current: prev.length + 1,
            total: 0,
            region: event.region,
            model: event.model,
            api_type: event.api_type,
            reasoning_effort: event.reasoning_effort,
            iteration: 1,
            round: 1,
            metrics: event.metrics,
          },
        ]);
        break;

      case "error":
        setError(event.message);
        break;

      case "complete":
        setProgress((prev) => ({
          ...prev,
          current: prev.total,
          message: event.message,
        }));
        break;

      case "done":
        setPhase("results");
        break;
    }
  }, []);

  const connectSSE = useCallback(
    (id: string) => {
      const url = sseUrl(`/api/benchmark/${id}/stream`);
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data) as SSEEvent;
          handleSSEEvent(data);

          if (data.type === "done") {
            es.close();
            eventSourceRef.current = null;
          }
        } catch {
          // Ignore JSON parse errors from non-JSON SSE messages
        }
      };

      es.onerror = () => {
        // EventSource reconnects automatically for transient errors.
        // If readyState is CLOSED, the server ended the stream.
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          eventSourceRef.current = null;
          // Only transition to results if we actually received final results
          setPhase((current) =>
            current === "running" ? "results" : current
          );
        }
      };
    },
    [handleSSEEvent]
  );

  const start = useCallback(
    async (config: BenchmarkConfig) => {
      cleanup();
      setError(null);
      setLiveResults([]);
      setFinalResults([]);
      setProbes({});
      setProgress({ current: 0, total: 0, message: "Starting..." });
      setIsMonitor(config.mode === "monitor");

      try {
        const { run_id } = await apiPost<{ run_id: string }>(
          "/api/benchmark/start",
          config
        );
        setRunId(run_id);
        setPhase("running");
        connectSSE(run_id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to start benchmark"
        );
      }
    },
    [cleanup, connectSSE]
  );

  const stop = useCallback(async () => {
    if (!runId) return;
    try {
      await apiPost(`/api/benchmark/${runId}/stop`, {});
    } catch {
      // Best effort; the SSE stream ending will handle phase transition
    }
    cleanup();
    setPhase("results");
  }, [runId, cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setPhase("config");
    setProgress({ current: 0, total: 0, message: "" });
    setLiveResults([]);
    setFinalResults([]);
    setProbes({});
    setRunId(null);
    setError(null);
  }, [cleanup]);

  return {
    phase,
    progress,
    liveResults,
    finalResults,
    probes,
    runId,
    error,
    isMonitor,
    start,
    stop,
    reset,
  };
}
