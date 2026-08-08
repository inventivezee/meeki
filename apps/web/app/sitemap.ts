import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "./site";

/**
 * No lastModified: nothing here tracks when the copy actually changed, and a
 * build timestamp would tell crawlers every page changed on every deploy.
 *
 * /r/[code] is deliberately absent — it is a cookie-setting redirect, not a
 * destination.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_ORIGIN}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/personal`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
