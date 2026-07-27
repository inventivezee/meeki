# External services

Every third-party account the CI and the shipped app touch, and what breaks
without it. Grounded in the actual `secrets.*` references under
`.github/workflows/` — nothing here is aspirational.

Status key: **DONE** = you already have it · **NEEDED** = required for the
desktop app to ship · **LATER** = only for a feature you haven't turned on ·
**DELETE** = upstream's, must not stay.

---

## Tier 1 — required to ship a signed, auto-updating Mac app

| Service | Status | Secrets | Used by |
| --- | --- | --- | --- |
| **Apple Developer Program** ($99/yr) | NEEDED — awaiting approval | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD` | `desktop_cd.yaml` |
| **CrabNebula Cloud** | DONE | `CN_API_KEY` | `desktop_cd.yaml`, `desktop_publish.yaml`, `desktop_e2e.yaml` |
| **Cloudflare R2** | DONE (account) — create bucket `meeki-build` | `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_ENDPOINT_URL` | `desktop_cd.yaml`, `download_staging.yaml`. Staging channel only, CI-only — the shipped app never reads R2. |
| **Tauri updater keypair** | NEEDED — self-generated, no signup | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `desktop_cd.yaml` |
| **GitHub** | DONE | `GITHUB_TOKEN` (automatic) | releases |

### Apple

Two things, often confused. The **certificate** (Developer ID Application) is
what signs the app; **notarization** is Apple scanning the signed build and
stapling a ticket. You need both. Without notarization macOS runs a full
code-signature validation on first launch of every new build — that is the
30–45 s cold start you measured, not a DNS or model-loading problem.

Export the certificate as a `.p12`, base64 it into `APPLE_CERTIFICATE`, and use
an **app-specific password** (not your Apple ID password) for `APPLE_PASSWORD`.

### Cloudflare R2

Done in the repo as of `ff9c4f0` — bucket, filename prefix and artifact names
all moved to `meeki-*` together, because the upload prefix in `desktop_cd.yaml`
and the grep in `download_staging.yaml` are a cross-workflow contract. All that
remains is creating the `meeki-build` bucket and setting the three secrets.

Scope is smaller than it looks: one bucket, one prefix (`desktop/staging/`), one
file type (`.dmg`), staging channel only. Nothing in `apps/`, `crates/`,
`plugins/` or `packages/` reads R2 at runtime.

### Tauri updater keypair

Not a signup — generate it and keep the private key somewhere you will not lose
it. Losing it means no existing install can ever accept another update; you'd
have to ship a fresh app and ask everyone to reinstall.

```bash
pnpm exec tauri signer generate -w ~/.tauri/meeki-updater.key
```

The public half goes in `tauri.conf.json` under `plugins.updater.pubkey`; the
private half plus its password become the two repo secrets.

---

## Tier 2 — only if you turn the feature on

| Service | Status | Secrets | What it powers |
| --- | --- | --- | --- |
| **Sentry** | LATER | `SENTRY_DSN` | Crash reporting. Currently dead: `ENABLE_SENTRY` is set nowhere, so the handler never runs in release. See the stripping note below. |
| **PostHog** | LATER | `POSTHOG_API_KEY` | Product analytics |
| **Supabase** | LATER | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Accounts + the web app's backend (`db_cd.yaml`, `web_cd.yaml`) |
| **Netlify** | LATER | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | Hosting `apps/web` (`web_cd.yaml`) |
| **Fly.io** | LATER | `FLY_API_TOKEN` | `apps/api` (whole cloud backend) and `apps/stripe`. `bot_cd.yaml` deploys `apps/bot`, which does not exist — dead CI, delete it. |
| **Stripe** | LATER | `VITE_PRO_PRODUCT_ID` | Paid tier |
| **OpenStatus** | LATER | `OPENSTATUS_API_KEY` | Uptime monitoring |
| **Infisical** | LATER | `INFISICAL_TOKEN`, `INFISICAL_PROJECT_ID` | Secrets manager for the server-side e2e jobs |
| **OpenRouter / Anthropic / Zhipu** | LATER | `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `ZHIPU_API_KEY` | Eval + changelog CI only — not the shipped app |

Nothing in Tier 2 blocks a desktop release. The app runs fully local without any
of it.

### Sentry, and why it matters now

`[profile.release] strip = "symbols"` is now set in the root `Cargo.toml` (drops
~45 MiB). That is safe today precisely because Sentry never initialises. If you
enable it later, don't undo the strip — add to the same profile:

```toml
debug = "full"
split-debuginfo = "packed"
```

rustc runs `dsymutil` before stripping, so you get a small binary *and* a
complete `.dSYM`. Upload it with `sentry-cli debug-files upload` after the build
and before notarization. That gives file+line symbolication — strictly better
than the mangled-name-only resolution the unstripped build offered.

---

## Blocking problems found in the release pipeline

Neither is a signup — both are wrong values pointing at upstream.

**The auto-updater is switched off and points at nothing.** Every one of the
seven Tauri configs under `apps/desktop/src-tauri/` has `updater.active: false`,
and none defines an `endpoints` array. The plugin is registered
(`src-tauri/src/lib.rs:186,208`) and the banner UI exists
(`src/main/update-banner.tsx`), but there is no update server — not CrabNebula,
not R2, not GitHub releases. One-click updates do not currently exist and no
amount of Apple notarization will create them.

**CrabNebula still targets upstream's app.** `desktop_cd.yaml:26` sets
`CN_APPLICATION: fastrepl/hyprnote2`. Replace with your own CrabNebula app slug
or every publish step targets someone else's project.

**Fly app names are upstream's.** `apps/api/fly.toml:1` declares
`app = 'hyprnote-ai'` and `apps/stripe/fly.toml:6` declares `hyprnote-stripe`.
Fly app names are globally unique, so `flyctl deploy` cannot succeed unless you
control upstream's Fly org. These have never been renamed — and with 18 commits
and zero git tags, neither CD pipeline has ever run from this repo.

---

## Tier 3 — upstream's, must be removed

| Item | Where | Why |
| --- | --- | --- |
| `YUJONGLEE_GITHUB_TOKEN_REPO` | `handle_release.yaml`, `handle_update.yaml`, `handle_staging.yaml` | A personal access token belonging to an upstream maintainer. These workflows cannot work for you and shouldn't be carrying someone else's credential name. |
| `AM_API_KEY`, `KEYGEN_ACCOUNT_ID`, `KEYGEN_VERIFY_KEY` | `legacy_desktop_cd.yaml` | The legacy pipeline pulls bundled models from upstream's private buckets and licenses via their Keygen account. It can never succeed with your credentials. |
| `CN_API_KEY_WEBDRIVER` | `desktop_e2e.yaml` | Second CrabNebula key scoped to upstream's app. |
| `bot_cd.yaml`, `bot_ci.yaml`, `crates/api-bot` | — | Deploy and typecheck `apps/bot` / `@meeki/bot`, neither of which exists in the repo or its history. Dead. |
| `SENTRY_DSN_HYPRNOTE_2` | — | Leftover second DSN. |

Deleting `legacy_desktop_cd.yaml` outright is the cleanest move — it targets
upstream's CrabNebula app, their S3 alias, and their Cloudflare account ID.

---

## Order to do them in

1. **Apple approval lands** → cert + notarization secrets. This alone fixes the
   slow cold start and the Gatekeeper warning.
2. **Generate the Tauri updater keypair** and back it up.
3. **Create the `meeki-build` R2 bucket**, rename bucket + prefix + grep in one
   commit.
4. **Delete the Tier 3 workflows and secrets.**
5. Everything in Tier 2 whenever the matching feature is wanted.
