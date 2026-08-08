import content from "./content.txt?raw";

/**
 * Served from a route rather than public/ so the content type is guaranteed.
 * As a static asset it came back as application/octet-stream, which makes a
 * browser download the file instead of showing it, and gives an AI crawler
 * every reason to skip it.
 *
 * ?raw inlines the text at build time — Workers has no filesystem to read.
 */
export function GET() {
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
