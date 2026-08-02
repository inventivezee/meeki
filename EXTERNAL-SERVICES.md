# External services

Every third-party account this project touches, what it costs, and what breaks
without it. Grounded in actual `secrets.*` references and runner labels under
`.github/workflows/` — nothing here is aspirational.

Last verified 2026-08-02.

---

## Done

| Service | What it does | Evidence |
| --- | --- | --- |
| **Apple Developer Program** ($99/yr) | Signs and notarizes the Mac app | 6 secrets set; Apple **accepted** submission `302e6980` |
| **Cloudflare** — DNS | `meeki.ai` nameservers | `noel`/`saanvi.ns.cloudflare.com` |
| **Cloudflare** — Workers | Hosts the website | `meeki.ai` returns HTTP 200 |
| **Cloudflare** — R2 | Staging build artifacts | bucket `meeki-build`, 3 secrets |
| **CrabNebula Cloud** | Update server + release CDN | `CN_API_KEY`, app `innovateabundance/meeki`; serving `0.0.1` |
| **Tauri updater keypair** | Signs auto-updates | `TAURI_SIGNING_PRIVATE_KEY`; private half at `~/.tauri/meeki-updater.key` |
| **GitHub** | Source + CI + releases | repo **public**; `desktop_v0.0.1` published |

Two consequences of going public worth knowing: **macOS CI minutes are now
free** (they bill at 10× on private repos), and the download links on the site
resolve instead of 404ing.

### The first release shipped

`desktop_v0.0.1` is live: a signed, notarized `Meeki_0.0.1_apple-silicon.dmg`
(191 MB) plus its SHA-256, reached from `meeki.ai` through
`/releases/latest`. That indirection is deliberate — the filename carries the
version, so a pinned link would go stale every release.

Auto-update is wired and verified against the endpoint the shipped build
actually polls. Reporting `0.0.0` returns a signed payload for `0.0.1`;
reporting `0.0.1` returns `204`. The signature's key id matches the `pubkey`
compiled into the app, so updates will verify rather than be silently
rejected.

---

## Not set up, and not needed yet

Nothing below blocks shipping the desktop app. It runs fully local.

| Service | What it would unlock | Worth it when |
| --- | --- | --- |
| **Supabase** | Accounts, CloudSync, sharing, entitlements | You want multi-device sync or paid tiers |
| **Fly.io** | `apps/api` — STT proxy, LLM proxy, web search, calendar brokering | You offer cloud features |
| **Stripe** | Taking payment | You charge for something |
| **Exa + Jina** | The `web_search` chat tool | You deploy `apps/api` — both keys are required for it to boot |
| **PostHog** | Product analytics | You want usage data |
| **Sentry** | Crash reporting | Note `ENABLE_SENTRY` is set nowhere, so it is currently dead code |
| **Nango** | Google/Outlook calendar brokering | Only for Windows/Linux — macOS already reads calendars locally via EventKit |
| **Depot** | Faster CI runners | See below |

### On Supabase specifically

It is the one that looks urgent and is not. The desktop app hides Account and
Sync entirely, and [MONETISATION.md](MONETISATION.md) argues for local,
anonymous, donation-framed licensing precisely so you do not need accounts.

Setting it up now buys nothing you can ship this week. It becomes the right
move when you want sync across devices, which is also the strongest thing to
charge for.

### On calendars

macOS users do not need Nango or any hosted API. `crates/apple-calendar` reads
EventKit directly, and EventKit enumerates CalDAV sources — so a user who adds
their Google account in **System Settings → Internet Accounts** gets their
Google Calendar in Meeki with no Meeki-side dependency at all. It works today
and is simply undiscoverable.

---

## Known gaps

**Depot runners.** Sixteen jobs across eleven workflows still request
`depot-ubuntu-*` / `depot-macos-*`. Depot is a paid service upstream used, and
a job requesting a runner you do not have does not fail — it queues forever.
`desktop_cd` was moved to `macos-latest`; `lint`, `fmt`, `desktop_ci`, `web_ci`,
`web_cd` and the e2e workflows will all hang the same way when first triggered.

**Upstream leftovers.** `YUJONGLEE_GITHUB_TOKEN_REPO` (a maintainer's personal
token, referenced by three `handle_*` workflows), `SENTRY_DSN_HYPRNOTE_2`, and
`CN_API_KEY_WEBDRIVER`. None can work for you.

**`crates/owhisper-client`** still trusts `hyprnote.com` and `char.com` as STT
proxy hosts alongside `meeki.ai`. A security surface rather than a rename.

**Intel Macs are not supported.** The `x86_64` target was dropped rather than
shipped broken — the bundle relies on MLX, which is Apple-Silicon only. Nothing
on `meeki.ai` says so yet, so an Intel user downloads 191 MB before finding
out. The release notes state the requirement; the site should too.

---

## What is actually next

1. **Install from `meeki.ai` on a second Mac.** The one test not yet run. The
   earlier "can't be opened" failure was `File created by an AppSandbox` — a
   complaint about how the file was transferred, not about the signature — so
   a browser download is the path that should finally work.
2. **Ship a `0.0.2` to exercise the update prompt.** The endpoint is verified;
   the in-app "update available → restart" flow has never run for real, and
   only a second release can prove it.
3. **Measure cold start on the notarized build.** The 30–45 s launch was
   attributed to notarization; that was never verified and may be wrong.
4. **Say "Apple Silicon only" on the site**, before someone downloads 191 MB
   to a Mac that cannot run it.
5. Everything else is optional until you decide to charge for something.
