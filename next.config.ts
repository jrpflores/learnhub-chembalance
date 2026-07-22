import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // Browsers always hit /favicon.ico; serve live branding favicon instead of a stale static file.
      {
        source: "/favicon.ico",
        destination: "/api/branding/favicon",
      },
    ];
  },
};

export default nextConfig;
