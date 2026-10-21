import type { NextConfig } from "next";

/**
 * Base URL of the backend API (see ../backend). Read at build time.
 * Unset = no backend: sessions are kept in the participant's browser only.
 */
const API_URL = process.env.API_URL?.replace(/\/+$/, "");

/** PostHog ingestion host for the same-origin /ingest proxy (see frontend/lib/analytics.ts). */
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com").replace(/\/+$/, "");
const POSTHOG_INGEST = POSTHOG_HOST.replace("://us.posthog.com", "://us.i.posthog.com").replace("://eu.posthog.com", "://eu.i.posthog.com");
const POSTHOG_ASSETS = POSTHOG_INGEST.replace("://us.i.", "://us-assets.i.").replace("://eu.i.", "://eu-assets.i.");

const nextConfig: NextConfig = {
  // PostHog's /ingest proxy needs the trailing slash left alone.
  skipTrailingSlashRedirect: true,
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@preflight/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser reaches the backend through this same-origin proxy, so there is
  // no CORS to configure and sendBeacon works: /api/responses → ${API_URL}/responses
  async rewrites() {
    const rules = [
      // PostHog, same origin so ad blockers don't drop events (static assets first).
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG_INGEST}/:path*` },
    ];
    if (API_URL) rules.push({ source: "/api/:path*", destination: `${API_URL}/:path*` });
    return rules;
  },
};

export default nextConfig;
