import { RELEASES_URL } from "../links";

const LATEST_RELEASE_API =
  "https://api.github.com/repos/inventivezee/meeki/releases/latest";

/**
 * meeki.ai/download — resolves to the current DMG so the CTA downloads the app
 * instead of opening a releases page to hunt through.
 *
 * It has to be resolved at request time rather than hardcoded: the asset name
 * carries the version (Meeki_0.0.11_apple-silicon.dmg), so any fixed URL breaks
 * on the next release. Matching on the .dmg suffix rather than the exact name
 * keeps this working if the filename changes shape.
 *
 * The redirect is cached at the edge so a burst of downloads is one API call,
 * not one per visitor — GitHub rate-limits unauthenticated calls by IP and a
 * Worker shares its egress addresses. Any failure falls through to the releases
 * page, so the button is never a dead end.
 */
const CACHE_SECONDS = 900;

export async function GET(request: Request) {
  const cache = await caches.open("meeki-download");
  const cacheKey = new Request(new URL(request.url).origin + "/download");

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let target = RELEASES_URL;

  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        // GitHub rejects API requests without one.
        "User-Agent": "meeki.ai",
        Accept: "application/vnd.github+json",
      },
    });

    if (response.ok) {
      const release = (await response.json()) as {
        assets?: { name: string; browser_download_url: string }[];
      };
      const dmg = release.assets?.find((asset) =>
        asset.name.toLowerCase().endsWith(".dmg"),
      );
      if (dmg) target = dmg.browser_download_url;
    }
  } catch {
    // Keep the releases-page fallback.
  }

  const redirect = new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // Only cache a resolved DMG. Caching the fallback would pin visitors to
      // the releases page for the whole TTL after a transient GitHub failure.
      "Cache-Control":
        target === RELEASES_URL
          ? "no-store"
          : `public, max-age=${CACHE_SECONDS}`,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });

  if (target !== RELEASES_URL) {
    await cache.put(cacheKey, redirect.clone());
  }

  return redirect;
}
