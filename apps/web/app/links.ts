export const GITHUB_URL = "https://github.com/inventivezee/meeki";

/** Fallback when the DMG cannot be resolved — see app/download/route.ts. */
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

/**
 * Every download CTA points here, not at GitHub. /download redirects to the
 * current DMG so the click downloads the app rather than opening a page the
 * visitor has to read.
 */
export const DOWNLOAD_URL = "/download";
