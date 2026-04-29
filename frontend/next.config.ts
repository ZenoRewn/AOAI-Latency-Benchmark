import type { NextConfig } from "next";

// Production build is a static export served by FastAPI at the same origin,
// so no proxy is needed. `next dev` runs its own Node server — rewrite
// /api and /healthz to the local FastAPI so same-origin fetches in the app
// Just Work without env vars.
//
// Rewrites are silently dropped by `next build` when `output: "export"` is
// set, so it is safe to always declare them.
const BACKEND_ORIGIN = process.env.DEV_BACKEND_ORIGIN ?? "http://localhost:8088";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out",
  trailingSlash: true,
  // Without this, `/api/foo` 308-redirects to `/api/foo/` before our
  // rewrite runs, which breaks SSE and adds a hop to every call.
  // Skipping the normalization is safe: the app is a single-route SPA,
  // and the rewrites below handle both backend paths directly.
  skipTrailingSlashRedirect: true,
  devIndicators: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
      { source: "/healthz", destination: `${BACKEND_ORIGIN}/healthz` },
    ];
  },
};

export default nextConfig;
