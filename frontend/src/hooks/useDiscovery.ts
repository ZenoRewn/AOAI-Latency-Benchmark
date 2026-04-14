"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { DiscoveredResource } from "@/types/benchmark";

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

    apiFetch<DiscoveredResource[]>("/api/resources/discover")
      .then((data) => {
        if (!cancelled) {
          setResources(data);
          setError(null);
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
