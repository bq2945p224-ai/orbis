import type { NextConfig } from "next";

/**
 * API traffic is handled by `app/api/[...path]/route.ts`:
 * - public `API_ORIGIN` → proxy to the real Nest API
 * - otherwise → in-preview guest API (never rewrite to localhost)
 *
 * Rewriting to `http://localhost:4000` on Vercel causes
 * `DNS_HOSTNAME_RESOLVED_PRIVATE` on every `/api/*` request.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@orbis/contracts"],
};

export default nextConfig;
