import { LLMS_TXT } from "./content";

/**
 * Served from a route rather than public/ so the content type is guaranteed.
 * As a static asset it came back as application/octet-stream, which makes a
 * browser download the file instead of showing it, and gives an AI crawler
 * every reason to skip it.
 *
 * The body is a module constant (see content.ts) — it used to be a `?raw`
 * import, which is Vite-only and did not survive the move off Workers.
 */
export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
