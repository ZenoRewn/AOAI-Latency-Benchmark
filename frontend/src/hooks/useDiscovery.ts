"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { subscribeUserToken } from "@/lib/userToken";
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
  // Bumped when the user-pasted token changes so the effect re-runs and
  // discovery re-issues under the new identity.
  const [tokenEpoch, setTokenEpoch] = useState(0);

  useEffect(() => {
    return subscribeUserToken(() => setTokenEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

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
  }, [tokenEpoch]);

  return { resources, loading, error };
}
