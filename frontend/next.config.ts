import type { NextConfig } from "next";

/**
 * Base URL of the backend API (see ../backend). Read at build time.
 * Unset = no backend: sessions are kept in the participant's browser only.
 */
const API_URL = process.env.API_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
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
    if (!API_URL) return [];
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
