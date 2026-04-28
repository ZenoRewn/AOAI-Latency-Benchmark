// Per-user Azure management access token. The user pastes an `az account
// get-access-token --resource https://management.azure.com` result; we
// store it in sessionStorage so it lives for the tab's lifetime and isn't
// shared across origins. No network roundtrip, no App Registration.

const KEY = "aoai_user_mgmt_token";
const EVENT_NAME = "aoai-user-token-change";
const MGMT_AUDIENCES = new Set([
  "https://management.azure.com",
  "https://management.azure.com/",
  "https://management.core.windows.net",
  "https://management.core.windows.net/",
]);

export interface JwtClaims {
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  upn?: string;
  preferred_username?: string;
  unique_name?: string;
  name?: string;
  tid?: string;
  [k: string]: unknown;
}

export interface UserTokenInfo {
  token: string;
  claims: JwtClaims;
  expiresAtMs: number;
  displayName: string;
}

export type TokenValidation =
  | { ok: true; info: UserTokenInfo }
  | { ok: false; reason: string };

function b64urlDecode(input: string): string {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") return atob(base64);
  // Node fallback (unused in browser, but keeps TS happy in SSR contexts).
  return Buffer.from(base64, "base64").toString("binary");
}

function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = b64urlDecode(parts[1]);
    // atob returns a binary string; convert to UTF-8 for Unicode claims.
    const utf8 = decodeURIComponent(
      Array.from(payload)
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(utf8) as JwtClaims;
  } catch {
    return null;
  }
}

function pickDisplayName(claims: JwtClaims): string {
  const candidate =
    (typeof claims.upn === "string" && claims.upn) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    (typeof claims.unique_name === "string" && claims.unique_name) ||
    (typeof claims.name === "string" && claims.name) ||
    "";
  return candidate || "Signed in";
}

/** Parse and validate a token string. Does not touch sessionStorage. */
export function inspectToken(raw: string): TokenValidation {
  const token = raw.trim();
  if (!token) return { ok: false, reason: "Token is empty." };
  const claims = decodeJwt(token);
  if (!claims) {
    return {
      ok: false,
      reason: "That doesn't look like an Azure access token (expected three dot-separated segments).",
    };
  }
  const aud = typeof claims.aud === "string" ? claims.aud : "";
  if (aud && !MGMT_AUDIENCES.has(aud)) {
    return {
      ok: false,
      reason:
        `This token targets ${aud} — auto-discovery needs a management token. ` +
        "Re-run the command with --resource https://management.azure.com.",
    };
  }
  const expSec = typeof claims.exp === "number" ? claims.exp : 0;
  const expiresAtMs = expSec * 1000;
  if (!expiresAtMs) {
    return { ok: false, reason: "Token has no expiration claim." };
  }
  if (expiresAtMs <= Date.now()) {
    return { ok: false, reason: "This token is already expired. Please fetch a new one." };
  }
  return {
    ok: true,
    info: {
      token,
      claims,
      expiresAtMs,
      displayName: pickDisplayName(claims),
    },
  };
}

export function setUserToken(raw: string): TokenValidation {
  const result = inspectToken(raw);
  if (!result.ok) return result;
  try {
    sessionStorage.setItem(KEY, result.info.token);
    notify();
  } catch {
    // sessionStorage may be unavailable in some sandboxed contexts.
  }
  return result;
}

/** Returns the stored token + claims if still valid; else clears and returns null. */
export function getValidUserToken(): UserTokenInfo | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  const result = inspectToken(raw);
  if (!result.ok) {
    clearUserToken();
    return null;
  }
  return result.info;
}

export function clearUserToken(): void {
  try {
    sessionStorage.removeItem(KEY);
    notify();
  } catch {
    // ignore
  }
}

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function subscribeUserToken(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, listener);
  // Also listen for storage events from other tabs (rare but cheap).
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}
