import type { SubscriptionStatus, SupabaseJwtPayload } from "./jwt";

export type Plan = "free" | "trial" | "pro";

export type BillingInfo = {
  entitlements: string[];
  subscriptionStatus: SubscriptionStatus | null;
  isPro: boolean;
  isLite: boolean;
  isPaid: boolean;
  isTrialing: boolean;
  trialEnd: Date | null;
  trialDaysRemaining: number | null;
  plan: Plan;
};

export function parseProGrantEmails(
  value: string | undefined | null,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Client-side Pro unlock for allowlisted emails or a local force flag. */
export function applyClientProGrant(
  payload: SupabaseJwtPayload | null,
  options: {
    forcePro?: boolean;
    grantEmails?: string[];
    email?: string | null;
  },
): SupabaseJwtPayload | null {
  const grantEmails = options.grantEmails ?? [];
  const email = options.email?.trim().toLowerCase() ?? null;
  const emailGranted = !!email && grantEmails.includes(email);
  const shouldGrant = options.forcePro === true || emailGranted;

  if (!shouldGrant) {
    return payload;
  }

  const base: SupabaseJwtPayload = payload ?? {
    entitlements: [],
    subscription_status: null,
  };
  const entitlements = base.entitlements ?? [];

  if (entitlements.includes("hyprnote_pro")) {
    return base;
  }

  return {
    ...base,
    entitlements: [...entitlements, "hyprnote_pro"],
    subscription_status:
      base.subscription_status === "trialing"
        ? base.subscription_status
        : (base.subscription_status ?? "active"),
  };
}

export function deriveBillingInfo(
  payload: SupabaseJwtPayload | null,
): BillingInfo {
  const entitlements = payload?.entitlements ?? [];
  const subscriptionStatus = payload?.subscription_status ?? null;

  const trialEnd = payload?.trial_end
    ? new Date(payload.trial_end * 1000)
    : null;

  let trialDaysRemaining: number | null = null;
  if (trialEnd) {
    const secondsRemaining = (trialEnd.getTime() - Date.now()) / 1000;
    trialDaysRemaining =
      secondsRemaining <= 0 ? 0 : Math.ceil(secondsRemaining / (24 * 60 * 60));
  }

  const isTrialing =
    subscriptionStatus === "trialing" &&
    trialDaysRemaining !== null &&
    trialDaysRemaining > 0;

  const hasProEntitlement = entitlements.includes("hyprnote_pro");
  const hasLiteEntitlement = entitlements.includes("hyprnote_lite");
  const hasEffectiveProEntitlement =
    subscriptionStatus === "trialing" ? isTrialing : hasProEntitlement;
  const hasPaidEntitlement = hasEffectiveProEntitlement || hasLiteEntitlement;

  const isPro = hasEffectiveProEntitlement;
  const isLite = hasLiteEntitlement;
  const isPaid = hasPaidEntitlement;

  const plan: Plan = isTrialing ? "trial" : hasPaidEntitlement ? "pro" : "free";

  return {
    entitlements,
    subscriptionStatus,
    isPro,
    isLite,
    isPaid,
    isTrialing,
    trialEnd,
    trialDaysRemaining,
    plan,
  };
}
