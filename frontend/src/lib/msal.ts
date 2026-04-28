import {
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

// MSAL.js is configured per-user through the UI instead of via a backend
// ConfigMap. The user fills in their own Entra ID App Registration details
// (client id + tenant) and the config is persisted to localStorage so it
// survives tab reloads.

export type TokenPurpose = "management" | "data";

export interface AppRegConfig {
  client_id: string;
  // Tenant id or one of: "organizations" (any AAD tenant), "common"
  // (AAD + personal MSA), "consumers" (MSA only).
  tenant: string;
}

const STORAGE_KEY = "aoai_app_reg_config";
const CHANGE_EVENT = "aoai-msal-change";

// Scopes required for each purpose. The App Registration must expose
// delegated permissions for both APIs — see docs/ for the exact `az ad app
// permission add` commands.
const MGMT_SCOPE = "https://management.azure.com/user_impersonation";
const AOAI_SCOPE = "https://cognitiveservices.azure.com/user_impersonation";

let instance: PublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;
let activeConfig: AppRegConfig | null = null;

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

export function getStoredConfig(): AppRegConfig | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppRegConfig;
    if (parsed && typeof parsed.client_id === "string" && typeof parsed.tenant === "string") {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

export function saveConfig(cfg: AppRegConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  instance = null;
  initPromise = null;
  activeConfig = null;
  emitChange();
}

// ---------------------------------------------------------------------------
// MSAL instance lifecycle
// ---------------------------------------------------------------------------

export function getMsal(): PublicClientApplication | null {
  return instance;
}

export function getActiveConfig(): AppRegConfig | null {
  return activeConfig;
}

export async function initMsal(cfg: AppRegConfig): Promise<void> {
  if (instance && activeConfig && activeConfig.client_id === cfg.client_id && activeConfig.tenant === cfg.tenant) {
    return;
  }
  // If config changed, reset so we re-create the client against the new IdP.
  instance = null;
  initPromise = null;

  const config: Configuration = {
    auth: {
      clientId: cfg.client_id,
      authority: `https://login.microsoftonline.com/${cfg.tenant || "organizations"}`,
      redirectUri: typeof window !== "undefined" ? window.location.origin : undefined,
      postLogoutRedirectUri: typeof window !== "undefined" ? window.location.origin : undefined,
    },
    cache: {
      // sessionStorage keeps tokens tab-local — switch to localStorage if we
      // later want cross-tab SSO.
      cacheLocation: "sessionStorage",
    },
  };
  const app = new PublicClientApplication(config);
  initPromise = app.initialize().then(() => {
    instance = app;
    activeConfig = cfg;
    emitChange();
  });
  await initPromise;
}

/** Bootstrap from persisted config, if any. Idempotent. */
export async function bootstrapMsal(): Promise<AppRegConfig | null> {
  const stored = getStoredConfig();
  if (!stored) return null;
  try {
    await initMsal(stored);
    return stored;
  } catch {
    return null;
  }
}

export function subscribeMsalAccount(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

// ---------------------------------------------------------------------------
// Account & auth flows
// ---------------------------------------------------------------------------

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

export async function signIn(): Promise<AccountInfo | null> {
  if (!instance) return null;
  const scopes = [MGMT_SCOPE, AOAI_SCOPE];
  try {
    const resp = await instance.ssoSilent({ scopes });
    if (resp.account) instance.setActiveAccount(resp.account);
    emitChange();
    return resp.account ?? null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError || (err as Error).name === "BrowserAuthError") {
      const resp = await instance.loginPopup({ scopes, prompt: "select_account" });
      if (resp.account) instance.setActiveAccount(resp.account);
      emitChange();
      return resp.account ?? null;
    }
    throw err;
  }
}

export async function signOut(): Promise<void> {
  if (!instance) return;
  const account = getActiveAccount();
  try {
    await instance.logoutPopup({ account: account ?? undefined });
  } finally {
    emitChange();
  }
}

/** Acquire an access token for a given purpose. Returns null if not signed in. */
export async function acquireToken(purpose: TokenPurpose): Promise<string | null> {
  if (!instance) return null;
  const account = getActiveAccount();
  if (!account) return null;
  const scopes = purpose === "management" ? [MGMT_SCOPE] : [AOAI_SCOPE];
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
