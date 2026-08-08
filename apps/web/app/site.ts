import { DOWNLOAD_URL, GITHUB_URL } from "./links";

/**
 * Every absolute URL the site emits resolves against this.
 *
 * It is a constant rather than the request's Host header on purpose: www and
 * apex both answer on 200, so a header-derived origin made each one advertise
 * itself as canonical and search engines saw two competing copies of the site.
 * SITE_ORIGIN lets preview deployments override it without reintroducing that.
 */
export const SITE_ORIGIN = process.env.SITE_ORIGIN ?? "https://meeki.ai";

export const SITE_NAME = "Meeki";

export const SITE_DESCRIPTION =
  "A fully private, open-source meeting note-taker that runs locally, works with your own AI, and can be self-hosted.";

/**
 * Structured data for the crawlers that read it instead of the page. Kept to
 * claims the page itself makes — no rating, no price, no version, because
 * nothing here keeps those current and a stale claim is worse than none.
 */
export function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_ORIGIN}/#app`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_ORIGIN,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Meeting transcription and note-taking",
        operatingSystem: "macOS 15 or later",
        processorRequirements: "Apple Silicon",
        downloadUrl: DOWNLOAD_URL,
        installUrl: DOWNLOAD_URL,
        codeRepository: GITHUB_URL,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        image: `${SITE_ORIGIN}/og.png`,
        publisher: { "@id": `${SITE_ORIGIN}/#org` },
        featureList: [
          "Captures system audio without adding a meeting bot to the call",
          "Records, transcribes, and stores meetings on your device",
          "Runs local transcription and local AI models",
          "Connects to your own AI provider with your own keys",
          "Self-hostable inside infrastructure you control",
          "Optional managed service",
          "Searchable notebook with storage and retention you decide",
        ],
      },
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#org`,
        name: SITE_NAME,
        url: SITE_ORIGIN,
        logo: `${SITE_ORIGIN}/icon-512.png`,
        sameAs: [GITHUB_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: SITE_NAME,
        url: SITE_ORIGIN,
        publisher: { "@id": `${SITE_ORIGIN}/#org` },
      },
    ],
  };
}
