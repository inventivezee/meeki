import { GITHUB_URL, RELEASES_URL } from "../links";

/**
 * meeki.ai/download — resolves to the current DMG so the CTA downloads the app
 * instead of opening a releases page to hunt through.
 *
 * It cannot be hardcoded: the asset name carries the version
 * (Meeki_0.0.11_apple-silicon.dmg), so any fixed URL breaks on the next release.
 *
 * It also deliberately does NOT use api.github.com. Unauthenticated API calls
 * are rate-limited to 60/hour per IP, and a Worker egresses from addresses
 * shared with every other Cloudflare customer — in production that quota was
 * already exhausted and every request fell through to the releases page, even
 * though the same call from a laptop reported 59 of 60 remaining.
 *
 * github.com/releases/latest redirects to the tagged release instead, and plain
 * github.com is not subject to that quota. The tag gives us the version, and the
 * asset name is derived from it — a convention verified across releases
 * 0.0.6 through 0.0.11. The derived URL is then confirmed with a HEAD before we
 * hand it to anyone, so a naming change degrades to the releases page rather
 * than to a broken download.
 */
const CACHE_SECONDS = 900;

async function resolveDmgUrl(): Promise<string | null> {
  const latest = await fetch(RELEASES_URL, {
    redirect: "manual",
    headers: { "User-Agent": "meeki.ai" },
  });

  const location = latest.headers.get("location");
  if (!location) return null;

  const tag = location.split("/releases/tag/")[1];
  if (!tag?.startsWith("desktop_v")) return null;

  const version = tag.slice("desktop_v".length);
  const candidate = `${GITHUB_URL}/releases/download/${tag}/Meeki_${version}_apple-silicon.dmg`;

  // A missing asset answers 404; a real one redirects to signed storage.
  const check = await fetch(candidate, {
    method: "HEAD",
    redirect: "manual",
    headers: { "User-Agent": "meeki.ai" },
  });
  if (check.status >= 400) return null;

  return candidate;
}

export async function GET() {
  let dmg: string | null = null;
  try {
    dmg = await resolveDmgUrl();
  } catch {
    // Fall through to the releases page.
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: dmg ?? RELEASES_URL,
      // Only cache a resolved DMG. Caching the fallback would pin visitors to
      // the releases page for the whole TTL after one transient failure.
      //
      // This used to be a manual `caches.open("meeki-download")` round-trip.
      // The Cache API is a Workers global and does not exist on Node, so that
      // call threw before its own try/catch could help — every /download would
      // have 500'd. s-maxage hands the same job to the CDN, which is where it
      // belonged anyway: one origin miss per TTL, shared across all visitors
      // rather than per-isolate.
      "Cache-Control": dmg
        ? `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`
        : "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
