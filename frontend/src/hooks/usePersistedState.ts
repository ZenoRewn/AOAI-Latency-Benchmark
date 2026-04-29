"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drop-in `useState` replacement that mirrors the value into localStorage.
 *
 * Scope: per-origin, per-browser-profile. Another user on a different
 * machine (or a different browser) cannot see these values. Same-machine
 * same-profile users do share storage — acceptable for this tool.
 *
 * Note: values are plain JSON in localStorage. Any same-origin JS can
 * read them, so only persist things that are already in React state
 * client-side (e.g. an API key the user just pasted into an input).
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  // Track whether we've finished the initial localStorage read, so the
  // "persist on change" effect doesn't overwrite stored values with the
  // React initial default on mount.
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setState(JSON.parse(raw) as T);
    } catch {
      // Corrupt JSON / storage disabled — fall through with `initial`.
    }
    hydratedRef.current = true;
    // `key` is expected to be stable; we intentionally hydrate once.
  }, [key]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Quota or private-mode write failure — silent; state still lives in memory.
    }
  }, [key, state]);

  return [state, setState];
}
