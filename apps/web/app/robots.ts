import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "./site";

/**
 * The AI crawlers are listed explicitly even though `*` already allows them.
 * Naming them is the point: it records an intentional decision to be readable
 * by AI answer engines, so nobody later reads the wildcard as an oversight.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // A cookie-setting 302, worthless in an index and it would spawn a
        // crawlable URL per referral code.
        disallow: "/r/",
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: "/r/",
      })),
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
