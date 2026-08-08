/**
 * Referrals are captured on the website and read at checkout — never inside the
 * desktop app. The payout is owed when someone buys, not when they install, so
 * the code only has to survive the hop from link click to purchase. That keeps
 * one signed binary for everyone instead of a per-referrer build, and keeps the
 * first-run experience free of a code entry field that most people would never
 * need.
 */
export const REFERRAL_COOKIE = "meeki_ref";

/** Long enough to cover "download now, decide to pay in a few weeks". */
export const REFERRAL_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * Codes appear in URLs, get typed by hand at checkout, and are read aloud
 * between friends, so keep them short, case-insensitive and unambiguous rather
 * than accepting anything a link contains.
 */
export function normalizeReferralCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

export function referralCookie(code: string) {
  return {
    name: REFERRAL_COOKIE,
    value: code,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_MAX_AGE_SECONDS,
  };
}
