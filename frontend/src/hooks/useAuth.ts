"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { AuthStatus } from "@/types/benchmark";

interface UseAuthReturn {
  method: AuthStatus["method"] | null;
  detail: string;
  loading: boolean;
}

export function useAuth(): UseAuthReturn {
  const [method, setMethod] = useState<AuthStatus["method"] | null>(null);
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiFetch<AuthStatus>("/api/auth/status")
      .then((data) => {
        if (!cancelled) {
          setMethod(data.method);
          setDetail(data.detail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMethod("none");
          setDetail(err instanceof Error ? err.message : "Failed to check auth");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { method, detail, loading };
}
