import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { normalizeReferralCode, referralCookie } from "../../referral";

/**
 * meeki.ai/r/ZEE10 — set the cookie, then hand the visitor to the site as if
 * they had arrived normally. The referrer's link should feel like a link to
 * Meeki, not like an affiliate landing page.
 *
 * The cookie is read at checkout, not by the app, so capturing it here is the
 * whole job: one binary for everyone, and no referral code to type at install.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await context.params;
  const code = normalizeReferralCode(raw);

  // Derived from the request so this works on localhost, a preview URL and the
  // real domain without configuration.
  const destination = new URL("/", new URL(request.url).origin);

  // A malformed code should still land the visitor on the site rather than a
  // 404 — the referrer mistyped, the visitor did nothing wrong.
  if (code) {
    const store = await cookies();
    store.set(referralCookie(code));
  }

  return NextResponse.redirect(destination, 302);
}
