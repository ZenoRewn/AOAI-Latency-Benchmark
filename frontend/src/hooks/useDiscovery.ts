"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { DiscoveredResource, DiscoverResponse } from "@/types/benchmark";

interface UseDiscoveryReturn {
  resources: DiscoveredResource[];
  loading: boolean;
  error: string | null;
}

export function useDiscovery(): UseDiscoveryReturn {
  const [resources, setResources] = useState<DiscoveredResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Backend now returns { resources, error } (always 200) so that the UI
    // can gracefully fall back to manual entry. Still tolerate the legacy
    // bare-array response from older backends.
    apiFetch<DiscoverResponse | DiscoveredResource[]>("/api/resources/discover")
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setResources(data);
          setError(null);
        } else {
          setResources(data.resources ?? []);
          setError(data.error ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Discovery failed");
          setResources([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { resources, loading, error };
}
