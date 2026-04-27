import {
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

export interface MsalServerConfig {
  enabled: boolean;
  client_id?: string;
  authority?: string;
  scopes?: string[];
}

let instance: PublicClientApplication | null = null;
let currentScopes: string[] = [];
let initPromise: Promise<void> | null = null;

export function getMsal(): PublicClientApplication | null {
  return instance;
}

export function getConfiguredScopes(): string[] {
  return currentScopes;
}

/** Create and initialize the MSAL client. Safe to call multiple times. */
export async function initMsal(cfg: MsalServerConfig): Promise<void> {
  if (!cfg.enabled || !cfg.client_id) return;
  if (instance) return;
  if (!initPromise) {
    const config: Configuration = {
      auth: {
        clientId: cfg.client_id,
        authority: cfg.authority ?? "https://login.microsoftonline.com/organizations",
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: {
        // sessionStorage keeps it tab-local; switch to localStorage if we
        // later want to share across tabs.
        cacheLocation: "sessionStorage",
      },
    };
    const app = new PublicClientApplication(config);
    initPromise = app.initialize().then(() => {
      instance = app;
      currentScopes = cfg.scopes ?? [
        "https://cognitiveservices.azure.com/user_impersonation",
      ];
    });
  }
  await initPromise;
}

export function getActiveAccount(): AccountInfo | null {
  if (!instance) return null;
  const active = instance.getActiveAccount();
  if (active) return active;
  const all = instance.getAllAccounts();
  if (all.length > 0) {
    instance.setActiveAccount(all[0]);
    return all[0];
  }
  return null;
}

/** Try silent SSO first (no popup); fall back to popup sign-in. */
export async function signIn(): Promise<AccountInfo | null> {
  if (!instance) return null;
  const scopes = currentScopes;
  try {
    const resp = await instance.ssoSilent({ scopes });
    if (resp.account) instance.setActiveAccount(resp.account);
    return resp.account ?? null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError || (err as Error).name === "BrowserAuthError") {
      const resp = await instance.loginPopup({ scopes, prompt: "select_account" });
      if (resp.account) instance.setActiveAccount(resp.account);
      return resp.account ?? null;
    }
    throw err;
  }
}

export async function signOut(): Promise<void> {
  if (!instance) return;
  const account = getActiveAccount();
  await instance.logoutPopup({ account: account ?? undefined });
}

/** Acquire an access token for the configured scopes. Returns null if not signed in. */
export async function acquireToken(): Promise<string | null> {
  if (!instance) return null;
  const account = getActiveAccount();
  if (!account) return null;
  const scopes = currentScopes;
  try {
    const resp = await instance.acquireTokenSilent({ account, scopes });
    return resp.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const resp = await instance.acquireTokenPopup({ account, scopes });
      return resp.accessToken;
    }
    throw err;
  }
}
