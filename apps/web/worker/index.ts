import handler from "vinext/server/app-router-entry";
/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const CANONICAL_HOST = "meeki.ai";

/**
 * www and the apex both answered 200, over http as well as https, so the same
 * site was reachable on four origins. The canonical tag already points them all
 * at https://meeki.ai/, but a canonical is a hint — this makes it a redirect.
 *
 * Scoped to the meeki.ai zone on purpose: localhost and the *.workers.dev
 * preview URL must keep serving directly or local testing breaks.
 */
function canonicalRedirect(url: URL): Response | null {
  const onZone =
    url.hostname === CANONICAL_HOST || url.hostname === `www.${CANONICAL_HOST}`;
  if (!onZone) return null;
  if (url.hostname === CANONICAL_HOST && url.protocol === "https:") return null;

  const target = new URL(url);
  target.hostname = CANONICAL_HOST;
  target.protocol = "https:";
  target.port = "";

  return Response.redirect(target.toString(), 301);
}

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    const redirect = canonicalRedirect(url);
    if (redirect) return redirect;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
