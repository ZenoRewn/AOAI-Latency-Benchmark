"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { apiFetch } from "@/lib/api";
import {
  initMsal,
  getActiveAccount,
  signIn as msalSignIn,
  signOut as msalSignOut,
  type MsalServerConfig,
} from "@/lib/msal";

interface UseMsalReturn {
  enabled: boolean;          // backend has MSAL configured
  account: AccountInfo | null;
  signedIn: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

let bootstrapped = false;
let bootstrapPromise: Promise<MsalServerConfig> | null = null;

function bootstrap(): Promise<MsalServerConfig> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const cfg = await apiFetch<MsalServerConfig>("/api/auth/msal-config");
      if (cfg.enabled) await initMsal(cfg);
      bootstrapped = true;
      return cfg;
    })();
  }
  return bootstrapPromise;
}

export function useMsal(): UseMsalReturn {
  const [enabled, setEnabled] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap()
      .then(async (cfg) => {
        if (cancelled) return;
        setEnabled(cfg.enabled);
        if (cfg.enabled) {
          // If the user already has an active AAD session, try a one-shot
          // silent sign-in on load. Ignore failures — user can still click
          // the button.
          try {
            const acct = await msalSignIn();
            if (!cancelled) setAccount(acct ?? getActiveAccount());
          } catch {
            if (!cancelled) setAccount(getActiveAccount());
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
      if (!bootstrapped) await bootstrap();
      const acct = await msalSignIn();
      setAccount(acct ?? getActiveAccount());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await msalSignOut();
    } finally {
      setAccount(null);
    }
  }, []);

  return {
    enabled,
    account,
    signedIn: !!account,
    signingIn,
    error,
    signIn,
    signOut,
  };
}
