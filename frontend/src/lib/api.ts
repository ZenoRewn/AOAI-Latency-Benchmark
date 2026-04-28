import { acquireToken, type TokenPurpose } from "./msal";

// When the frontend is served by FastAPI (production / container / AKS),
// requests go to the same origin as the page. Only set NEXT_PUBLIC_API_URL
// during local `next dev` against a separately-running backend.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// Pick the right token audience per endpoint:
// - ARM management plane (list subscriptions / Cognitive Services accounts)
// - Azure OpenAI data plane (run the benchmark)
function purposeFor(path: string): TokenPurpose {
  if (path.startsWith("/api/resources/")) return "management";
  return "data";
}

async function withAuthHeader(path: string, init?: RequestInit): Promise<RequestInit> {
  let token: string | null = null;
  try {
    token = await acquireToken(purposeFor(path));
  } catch {
    // Silent acquisition failed — caller proceeds without a token and the
    // backend will fall back to DefaultAzureCredential (useful for local dev
    // with `az login`).
  }
  if (!token) return init ?? {};
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const finalInit = await withAuthHeader(path, init);
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
