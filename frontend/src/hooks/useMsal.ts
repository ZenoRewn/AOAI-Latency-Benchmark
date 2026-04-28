"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import {
  bootstrapMsal,
  clearConfig,
  getActiveAccount,
  getActiveConfig,
  initMsal,
  saveConfig,
  signIn as msalSignIn,
  signOut as msalSignOut,
  subscribeMsalAccount,
  type AppRegConfig,
} from "@/lib/msal";

interface UseMsalReturn {
  // True when an App Registration has been configured (client_id + tenant).
  configured: boolean;
  account: AccountInfo | null;
  signedIn: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  // Save a new App Reg config, initialise the MSAL client, and attempt an
  // immediate sign-in. Safe to call repeatedly.
  configure: (cfg: AppRegConfig) => Promise<void>;
  // Drop the persisted config and sign out.
  resetConfig: () => Promise<void>;
}

export function useMsal(): UseMsalReturn {
  const [configured, setConfigured] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshFromState = useCallback(() => {
    setConfigured(!!getActiveConfig());
    setAccount(getActiveAccount());
  }, []);

  useEffect(() => {
    let cancelled = false;
    bootstrapMsal()
      .then(async (cfg) => {
        if (cancelled || !cfg) return;
        refreshFromState();
        // Attempt silent SSO so returning users skip the popup.
        try {
          const acct = await msalSignIn();
          if (!cancelled) setAccount(acct ?? getActiveAccount());
        } catch {
          // Popup was needed — leave it to an explicit user click.
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    const unsubscribe = subscribeMsalAccount(refreshFromState);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshFromState]);

  const configure = useCallback(async (cfg: AppRegConfig) => {
    setError(null);
    setSigningIn(true);
    try {
      saveConfig(cfg);
      await initMsal(cfg);
      refreshFromState();
      const acct = await msalSignIn();
      setAccount(acct ?? getActiveAccount());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningIn(false);
    }
  }, [refreshFromState]);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
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

  const resetConfig = useCallback(async () => {
    try {
      await msalSignOut();
    } catch {
      // ignore
    }
    clearConfig();
    setAccount(null);
    setConfigured(false);
  }, []);

  return {
    configured,
    account,
    signedIn: !!account,
    signingIn,
    error,
    signIn,
    signOut,
    configure,
    resetConfig,
  };
}
