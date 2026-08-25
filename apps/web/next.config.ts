import type { NextConfig } from "next";

/**
 * HSTS was set at the Cloudflare edge, not in the app — moving off the orange
 * cloud drops it, so it is declared here instead. Two years, subdomains
 * included, preload-eligible.
 *
 * www → apex is NOT here: it is a Vercel domain-level redirect, which answers
 * before a function is invoked. Doing it in `redirects()` would work but would
 * bill a function call for every www hit, and would not cover the apex's own
 * http → https hop, which Vercel already handles at the edge.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
