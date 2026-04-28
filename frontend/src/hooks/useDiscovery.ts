"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { subscribeMsalAccount } from "@/lib/msal";
import type { DiscoveredResource, DiscoverResponse } from "@/types/benchmark";

interface UseDiscoveryReturn {
  resources: DiscoveredResource[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDiscovery(): UseDiscoveryReturn {
  const [resources, setResources] = useState<DiscoveredResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the signed-in MSAL account changes (sign-in/out) so discovery
  // re-issues under the new identity.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => subscribeMsalAccount(() => setEpoch((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

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
  }, [epoch]);

  const refresh = useCallback(() => setEpoch((n) => n + 1), []);

  return { resources, loading, error, refresh };
}
