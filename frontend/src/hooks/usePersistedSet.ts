"use client";

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";

/**
 * Set<string> wrapper around usePersistedState. localStorage can't serialize
 * a Set, so we mirror through a string[] under the hood and rebuild the Set
 * on read. The returned setter accepts the same shape as React's
 * Dispatch<SetStateAction<Set<string>>>, so call sites that already use
 * `setSet(prev => new Set(prev).add(x))` keep working unchanged.
 */
export function usePersistedSet(
  key: string,
  initial: Set<string>,
): [Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>] {
  const [arr, setArr] = usePersistedState<string[]>(key, [...initial]);
  const set = useMemo(() => new Set(arr), [arr]);
  const setSet = useCallback<React.Dispatch<React.SetStateAction<Set<string>>>>(
    (updater) => {
      setArr((prev) => {
        const prevSet = new Set(prev);
        const next =
          typeof updater === "function"
            ? (updater as (s: Set<string>) => Set<string>)(prevSet)
            : updater;
        return [...next];
      });
    },
    [setArr],
  );
  return [set, setSet];
}
