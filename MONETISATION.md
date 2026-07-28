# Monetisation and referrals — proposal

A response to the lifetime-membership + referral plan. The headline: the
referral half can be roughly a tenth of the work you described, and the
metering half is harder than it looks for reasons that are worth deciding on
deliberately rather than discovering later.

---

## 1. Referrals: track on the website, never in the app

### What you proposed

Cookie on the site → serve a **different app build** to referred users → that
build makes the referral code **mandatory** at first run → app reports the code.

### The problem with it

Serving a per-referral binary breaks things that are expensive to unbreak:

- **Notarization and updates.** Each variant is a distinct artifact. The Tauri
  updater keys releases by target and version, not by referral cohort. Two
  builds means two update channels, or a referred user who can never update.
- **Code signing.** Every variant needs signing and notarizing. Apple's
  notary service is per-submission; this multiplies build time by the number
  of cohorts.
- **Mandatory code entry is a conversion tax on the wrong people.** It lands
  on a free user at first run — the moment with the highest drop-off — to
  capture information that only matters if they later pay.
- **Cookies are lossy.** Downloaded on a work laptop, bought at home. Safari's
  ITP caps script-set cookies at 7 days. Private windows keep nothing.

### The observation that collapses it

**The $10 is owed at purchase, not at install.** The referral only has to
survive from *link click* to *checkout*. It never has to enter the app at all.

### Proposed architecture

```
meeki.org/r/ZEE10
   │  set first-party cookie referral=ZEE10, 90 days, HttpOnly
   │  302 → /download   (the same signed, notarized binary as everyone else)
   ▼
User installs, uses the free tier, hits the limit
   │  "Upgrade" opens meeki.org/buy in the browser
   ▼
/buy reads the cookie server-side
   │  Stripe Checkout Session, metadata: { referral_code: "ZEE10" }
   ▼
Stripe webhook → checkout.session.completed
   │  read metadata.referral_code → credit the referrer
   ▼
Payout queue
```

**One binary. No app changes. No mandatory code entry.**

Cover the cookie-loss case with an **optional** "Referral code" field on the
checkout page, prefilled from the cookie when present. A referrer who wants
credit will tell their friend the code; a friend who wants to help will type
six characters at the moment they are already typing card details.

### What this needs

| Piece | Where | Effort |
|---|---|---|
| `/r/:code` redirect + cookie | `apps/web` | ~1 hour |
| Optional code field on checkout | `apps/web` | ~2 hours |
| `referral_code` in Checkout metadata | `apps/stripe` | ~1 hour |
| Referral + payout tables | Supabase migration | ~2 hours |
| Webhook credit on completion | `apps/stripe/src/routes/webhook.ts` | ~3 hours |

`apps/stripe` already receives `checkout.session.completed` and fans out to
Supabase, PostHog and Loops, so the webhook is an addition to an existing
handler rather than new infrastructure.

### Fraud, briefly

Self-referral is the obvious attack: buy through your own link, get $10 back,
net cost $10. Cheapest effective mitigations, in order:

1. Refuse payout when the referrer's and buyer's Stripe `customer.email` match.
2. Hold payouts for the refund window (Stripe disputes run 120 days; 30 is a
   reasonable compromise).
3. Cap payouts per referrer per month, and review anything above it by hand.

Do not build a fraud system up front. At $10 a unit, manual review scales
further than you would expect.

---

## 2. The economics deserve a second look

At **$20 lifetime with a $10 referral**:

```
Revenue                    $20.00
Stripe (2.9% + $0.30)      -$0.88
Referral payout           -$10.00
                          ────────
Net on a referred sale      $9.12
```

**A 50% customer acquisition cost, paid in cash, on a product with no
recurring revenue.** That works only if referred sales are a minority, because
there is no second payment to amortise it against.

Three alternatives worth weighing:

- **$5 cash.** Still motivating; keeps net at ~$14.
- **Credit rather than cash.** "Refer 2 friends, get your own lifetime free."
  Costs you nothing marginal, has no tax reporting, and cannot be farmed for
  money.
- **Two-sided discount.** Referred user pays $15, referrer gets $5. Improves
  conversion *and* halves the payout.

Also note: paying individuals cash creates **1099 reporting obligations** in
the US above $600/year per person, and Stripe Connect or similar to actually
send money. Credit avoids that entirely. I would start with credit.

---

## 3. The 20 hours/month limit is the hard part

Two problems, and the first is bigger than the second.

### 3a. Metering requires identity, which contradicts the product

To enforce a monthly quota you must know *who* is recording. That means a free
user needs an account. Today Meeki has no login at all and works fully offline
— that is currently its strongest differentiator against Otter, Fireflies and
Granola, all of which are cloud-first.

Making the free tier require sign-up is a **product repositioning**, not a
feature. Worth doing deliberately if at all.

**Alternative that keeps the positioning:** meter locally and anonymously.
Store minutes used in the app's own database. No account, no server, no
identity. Trivially bypassable by anyone who edits SQLite — and that is fine,
because the population who will do that overlaps almost entirely with the
population who would never have paid $20.

### 3b. Trustworthy time without a clock you control

You are right that the device clock is not trustworthy. Options, cheapest
first:

1. **Signed time from your own API.** `GET /time` returns a signed timestamp;
   the app refuses to advance the quota window without one seen in the last N
   days. Requires the API you have not deployed.
2. **Roughtime.** A public, cryptographically verifiable time protocol
   (Cloudflare runs a server). No backend needed. More code than option 3.
3. **Monotonic local heuristic.** Store `last_seen_at`; refuse to move the
   window backwards; if the clock jumps back, keep the old window. Defeats
   casual date-changing, not a determined user. **Zero infrastructure.**

For a $20 product I would ship (3) and stop. The cost of (1) is a deployed
API, an always-online requirement, and a support burden when someone's
firewall blocks you. The benefit is stopping a person who was going to save
$20 by editing their clock.

### What I would actually do

**Ship the limit as a soft one first.** Track hours locally, show usage in
settings, and at 20 hours show a genuine but dismissible upgrade prompt. Watch
the conversion rate for a month. If people pay, harden later; if they do not,
the enforcement work would have been wasted anyway.

Hard gates convert worse than most people expect on tools users have already
integrated into their week — and you can always tighten. Loosening after
you have annoyed people is harder.

---

## 4. If it stays free and unlimited

Ranked by fit with what Meeki already is:

1. **Paid cloud sync / multi-device.** You already have CloudSync, E2EE and
   attachment sync built and gated behind `hyprnote_pro`. It has a real
   marginal cost, so charging is honest, and it is the top request for any
   local-first notes app. This is the strongest option and most of the code
   exists.
2. **Hosted transcription for weak machines.** A base M1 struggles; not
   everyone has better. Sell minutes to people whose hardware cannot do it
   locally. The STT proxy already exists in `apps/api`.
3. **Team / shared workspaces.** Sharing already exists behind the paywall.
   Per-seat pricing on teams is where meeting tools actually make money.
4. **Hosted LLM credits.** Sell a bundle for people who do not want to run a
   model. The OpenRouter proxy already exists.
5. **Supporter pricing.** One-time payment, no gates, a badge and a warm
   feeling. Works better than expected for local-first tools with an
   opinionated audience, and costs nothing to build.

The pattern: **charge for things with a marginal cost to you** (sync, hosted
inference, storage), not for local features that cost you nothing. It is
easier to justify, easier to price, and does not degrade the free product.

---

## Recommended sequence

1. **Deploy the API and get DNS working.** `meeki.org` and `api.meeki.org` are
   both NXDOMAIN today. Nothing here — checkout, referrals, entitlements,
   signed time — functions without that. It is the gate on everything else.
2. **Local soft metering.** Count hours, show usage, prompt at the limit. No
   account required, no server required.
3. **Stripe checkout + lifetime entitlement.** `apps/stripe` already handles
   the webhook and writes entitlements to Supabase.
4. **Referral links via cookie → checkout metadata.** One binary, optional
   code field, credit rather than cash to start.
5. **Harden metering only if the conversion data justifies it.**

Steps 2 and 3 are independent — metering can ship before payments exist, and
tells you whether anyone hits 20 hours at all before you build a paywall.
