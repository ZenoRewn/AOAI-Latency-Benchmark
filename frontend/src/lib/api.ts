import { acquireToken } from "./msal";
import { getValidUserToken } from "./userToken";

// When the frontend is served by FastAPI (production / container / AKS),
// requests should go to the same origin as the page. Only set
// NEXT_PUBLIC_API_URL during local `next dev` against a separately-running
// backend (e.g. http://127.0.0.1:8088).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function withAuthHeader(init?: RequestInit): Promise<RequestInit> {
  // Priority:
  // 1. User-pasted management token (sessionStorage). Lets each visitor
  //    authenticate as themselves without an App Registration.
  // 2. MSAL.js silent acquisition (only active when the backend publishes
  //    AAD_CLIENT_ID). Currently dormant in prod.
  // 3. No header — backend falls back to DefaultAzureCredential, useful
  //    for local dev with an `az login` session.
  let token: string | null = null;
  const userToken = getValidUserToken();
  if (userToken) {
    token = userToken.token;
  } else {
    try {
      token = await acquireToken();
    } catch {
      // Silent acquisition failed — caller will see an unauthenticated request.
    }
  }
  if (!token) return init ?? {};
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const finalInit = await withAuthHeader(init);
  const res = await fetch(`${API_BASE}${path}`, finalInit);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function sseUrl(path: string): string {
  return `${API_BASE}${path}`;
}
