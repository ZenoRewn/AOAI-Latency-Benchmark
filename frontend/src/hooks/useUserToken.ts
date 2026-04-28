"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearUserToken,
  getValidUserToken,
  subscribeUserToken,
  type UserTokenInfo,
} from "@/lib/userToken";

export interface UseUserTokenReturn {
  token: UserTokenInfo | null;
  msLeft: number;
  minutesLeft: number;
  expiringSoon: boolean;
  clear: () => void;
}

export function useUserToken(): UseUserTokenReturn {
  const [token, setToken] = useState<UserTokenInfo | null>(() =>
    typeof window === "undefined" ? null : getValidUserToken(),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setToken(getValidUserToken());
    // Pick up changes from sibling components (paste, sign-out).
    const unsub = subscribeUserToken(refresh);
    // Also recheck on mount in case SSR rendered empty.
    refresh();
    return unsub;
  }, []);

  useEffect(() => {
    if (!token) return;
    // Tick once a minute so countdown stays fresh. Clear automatically on
    // expiry — `getValidUserToken` will return null and the listener picks
    // it up via the next subscription event.
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (token.expiresAtMs <= Date.now()) {
        clearUserToken();
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [token]);

  const msLeft = token ? Math.max(0, token.expiresAtMs - now) : 0;
  const minutesLeft = Math.floor(msLeft / 60_000);
  const expiringSoon = !!token && msLeft > 0 && msLeft < 5 * 60_000;

  const clear = useCallback(() => {
    clearUserToken();
  }, []);

  return { token, msLeft, minutesLeft, expiringSoon, clear };
}
