# Meeki deployment runbook

What to set up, in what order, to bring `meeki.ai` online. Nothing here blocks
local development or the desktop app: the current build points `VITE_API_URL`
and `VITE_APP_URL` at localhost, cloud features are opt-in, and the app is
local-first by design. Until these steps are done, sign-in/Pro, hosted share
links, CloudSync, and the docs links in the UI are simply dead.

## 0. What works today with no infrastructure

- Recording, on-device transcription, on-device summaries, notes, calendar,
  export, CLI/MCP — everything local.
- Model downloads (Hugging Face directly).
- What does NOT work: sign-in (needs Supabase), Pro entitlements (Stripe),
  share links and CloudSync (needs the API), `docs.meeki.ai` help links (404
  until docs are deployed), auto-updates (endpoint deliberately empty).

## 1. DNS (registrar for meeki.ai)

| Record | Host | Points to | For | Status |
|--------|------|-----------|-----|--------|
| — | `meeki.ai` | Cloudflare Workers custom domain | web app | **live** |
| CNAME | `www` | should 301 to apex | redirect | **live but wrong — see below** |
| CNAME | `docs` | Mintlify (`cname.mintlify.app` — confirm in dashboard) | docs | **no DNS record** |
| CNAME | `api` | Fly.io app hostname | API | not created |

Add each only when the service below is live; a dangling CNAME helps nobody.

The zone is already on Cloudflare nameservers (`noel`/`saanvi.ns.cloudflare.com`).

Two live problems in that table:

- **`www.meeki.ai` returns 200 instead of redirecting.** It serves the whole
  site as a second origin. The app-side half of this is fixed — `SITE_ORIGIN` in
  [apps/web/app/site.ts](apps/web/app/site.ts) pins every canonical and `og:url`
  to the apex regardless of which hostname served the request — but the
  duplicate origin still answers. Add a `www` → apex 301 (and `http` → `https`)
  bulk redirect in the Cloudflare dashboard to close it properly.
- **`docs.meeki.ai` has no DNS record at all** — NXDOMAIN, not merely
  undeployed. Anything pointing at it is a dead link, which is why the nine
  `docs.meeki.ai` URLs were dropped from `llms.txt`. `AGENTS.md` still lists it
  as the dev docs link.

## 2. meeki.ai — web app (Cloudflare Workers)

**This is already live.** `apps/web` is a Next.js 16 app built by
[vinext](https://github.com/cloudflare/vinext) and served from a Cloudflare
Worker — confirmed by the `vary: X-Vinext-*` header on the live response. It is
not on Netlify and never was.

### Where the code came from

Until this consolidation the deployed source lived only in
`~/Documents/meekifrontend`, whose single git remote was
`https://git.chatgpt-team.site/2575900e-0f60-4127-9d9f-f09debc03465/appgprj_6a66aa43a7fc8191aa8da33e367f017e.git`
— a sandbox host, not infrastructure you control. It is now `apps/web`, merged
with `git subtree` so all 8 of its commits are in this repository's history.
That remote is recorded here only so it is not lost; treat this repo as the
source of truth.

### Who deploys it — UNCONFIRMED, resolve before using web_cd

There is no `wrangler.toml` in the tree: vinext generates
`apps/web/dist/server/wrangler.json` during the build. Nothing in the repo names
a Cloudflare account. `.openai/hosting.json`'s `project_id` is identical to the
path segment of that sandbox git remote, which strongly suggests the ChatGPT
sites control plane built and deployed the site — possibly into a Cloudflare
account that is not yours.

[.github/workflows/web_cd.yaml](.github/workflows/web_cd.yaml) exists but is
`workflow_dispatch` only and its `dry_run` input **defaults to true**. Work
through this before ever running it with `dry_run: false`:

1. Log into the Cloudflare dashboard and find the Worker. The build calls it
   `meeki-website`. Confirm it exists, and note which **account** owns it.
2. Confirm what publishes it today. If **Workers Builds / a connected Git
   repo** does, this workflow would become a second publisher racing it —
   disconnect that build first. If the **ChatGPT sites control plane** does,
   then moving the code here has already severed the trigger and CI is now the
   only path, making this workflow mandatory rather than optional.
3. Check where the `meeki.ai` custom domain is bound. If it is bound to a Worker
   in an account you do not control, you need your own Worker plus a domain
   re-point, and the cutover has a window where the site can go down.
4. Create an API token scoped to *Edit Cloudflare Workers* for that account and
   add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. Run web_cd with `dry_run: true`. It prints the resolved worker name, compat
   date and assets directory — check them against the dashboard.
6. Only then run with `dry_run: false`. The job curls `/`, `/personal`,
   `/sitemap.xml`, `/llms.txt`, `/robots.txt` and `/favicon.ico` afterwards and
   fails if any is not 200.

### Cloudflare may be shadowing robots.txt

Before this change, `https://meeki.ai/robots.txt` returned **Cloudflare's
managed content-signals file** — 1,248 bytes of comments with no `User-agent`,
no `Disallow` and, critically, no `Sitemap` directive. That file does not come
from this repository.

[apps/web/app/robots.ts](apps/web/app/robots.ts) now generates a real one, but
if the managed setting is still enabled Cloudflare's version may keep winning
and the `Sitemap` line never reaches crawlers. Check **Security → Settings →
Content signals / robots.txt** (naming moves between dashboard revisions) and
disable the managed file. web_cd's post-deploy step greps for `Sitemap:` and
fails if it is missing, so this cannot regress silently.

### Web surfaces the backend still expects but that do not exist

The removed TanStack tree implemented the shared-note viewer, auth callbacks,
Stripe checkout/portal and an admin CMS. **None of it was ever deployed** — those
routes 404 on meeki.ai today exactly as they did before this consolidation, so
nothing regressed here. But Rust code still generates links into them, and it is
worth knowing these are dead ends rather than assuming a deploy would fix them:

| Emitted by | URL | Live status |
|---|---|---|
| [crates/api-sync/src/shared_notes.rs:412](crates/api-sync/src/shared_notes.rs:412) | `https://meeki.ai/share/invite/{invitation_id}/#token=…` | **404** |
| desktop / crates | `https://meeki.ai/share/public/…`, `https://meeki.ai/share/…` | **404** |
| desktop | `https://meeki.ai/onboarding-demo/` | **404** |

The invite path is the one that matters: `shared_notes.rs` sends that URL in a
real Loops transactional email (template `cmrvkrh3c0k0t0jvh80zpkk93`), so any
share invitation sent today mails the recipient a link to a 404. Either build the
route in `apps/web/app/` or stop sending the email — the recipient experience is
currently worse than no feature at all.

The old implementations are in commit `852ee6c` if they are worth porting rather
than rewriting.

### Not carried over

`apps/web/public/.well-known/microsoft-identity-association.json` existed in the
old tree, listing Azure AD application IDs `22bc6342-…` and `3d7c41ea-…` for
publisher-domain verification. It was never served (that tree was never
deployed), and the app registrations are probably upstream's, so publishing it
would claim meeki.ai as the publisher domain for apps you may not own. It is
recoverable from commit `852ee6c` if those registrations turn out to be yours.

## 3. docs.meeki.ai — docs (Mintlify)

The `docs/` directory is a Mintlify site; [docs.json](docs/docs.json) already
declares `"name": "Meeki"` and canonical `https://docs.meeki.ai`.

1. Create a Mintlify project pointed at this repo, docs root `docs/`.
2. Set the custom domain `docs.meeki.ai`; add the CNAME it gives you.
3. Until then, every `docs.meeki.ai/...` link inside the desktop app 404s —
   they are plain links, nothing crashes.

## 4. Supabase — auth + database (prerequisite for the API)

1. Create a Supabase project; apply the migrations in `supabase/`.
2. Note: entitlement keys `hyprnote_pro` / `hyprnote_lite` and SQL functions
   like `authenticate_as_hyprnote_pro` are intentionally NOT renamed — they are
   contracts between the SQL, the API, and Stripe metadata. Rename all three
   sides together or not at all.
3. Wire it in:
   - Desktop (build-time): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in
     `apps/desktop/.env.build`.
   - API (runtime): the `SUPABASE_*` vars listed in `crates/api-env`.
   - Admin Pro grants without Stripe: `private.pro_grants` (see PRD §2.2) or
     client-side `VITE_FORCE_PRO` / `VITE_PRO_GRANT_EMAILS` for testing.

## 5. api.meeki.ai — API server (Fly.io)

`apps/api` has a `Dockerfile` and `fly.toml`, **but `fly.toml` still says
`app = 'hyprnote-ai'` — that is upstream's Fly app name and must be changed**
before `fly deploy` (e.g. `app = 'meeki-api'`).

1. `fly launch` from `apps/api` (or edit `fly.toml` and `fly deploy`).
2. Set secrets per `crates/api-env` / PRD §10.2: `SUPABASE_*`, `STRIPE_*`,
   STT/LLM provider keys for the proxies, `SQLITECLOUD_*` if using CloudSync,
   optional `POSTHOG_API_KEY` / `SENTRY_DSN`.
3. `fly certs add api.meeki.ai`, then add the CNAME.
4. Point the desktop at it: set `VITE_API_URL=https://api.meeki.ai` in
   `apps/desktop/.env.build` and rebuild. (Today it is localhost, so shipped
   builds make no cloud calls at all.)

## 6. Stripe (only when charging users)

Products/prices per `packages/pricing`; the Supabase auth hook maps Stripe
entitlements to `hyprnote_pro` / `hyprnote_lite` claims. Test-mode keys work
end-to-end with the API.

## 7. Auto-updates (optional, desktop stable channel)

Currently **disabled**: `tauri.conf.stable.json` has `"endpoints": []` and no
`pubkey`, so shipped apps never phone home for updates.

1. Generate a signing keypair: `pnpm tauri signer generate`.
   Keep the private key out of the repo; put it in CI secrets.
2. Host a `latest.json` updater manifest — GitHub Releases is the simplest.
3. Fill `plugins.updater.endpoints` + `pubkey` in `tauri.conf.stable.json`.

## 8. External contracts the rebrand renamed (audit-confirmed)

Every one of these has its other half outside this repo. The repo now uses the
NEW name; create the external side under that name (do not revert the repo).

| Repo side (new name) | External side to create/update |
|---|---|
| `.github/workflows/{api_cd,stripe_cd,llm_e2e,stt_e2e}.yaml` read Infisical paths `/meeki/{cloudsync,ai,web,llm,stt}` | Your Infisical project needs folders with those names (upstream's used `/anarlog/*`) |
| `api_cd.yaml` + `verify_cloudsync_e2ee.py` + `crates/api-sync` require secrets named `MEEKI_CLOUDSYNC_DATABASE_ID`, `MEEKI_CLOUDSYNC_E2EE_DATABASE_ID`, `MEEKI_CLOUDSYNC_PROTOCOL_MODE`, `MEEKI_CLOUDSYNC_TOKEN_TTL_SECONDS` | Create the secrets under these exact keys |
| `api_cd.yaml` deploys Fly app `hyprnote-ai`; `apps/api/fly.toml` says the same | Create your own Fly app and change both |
| Test-only env vars `MEEKI_CLOUDSYNC_*` in `crates/db-app/tests` | Set with the new names when running those ignored E2EE tests |
| `.github/workflows/desktop_cd.yaml` still names CrabNebula app `fastrepl/hyprnote2` | Create your own CrabNebula Cloud app (or publish DMGs as GitHub release assets) |
| ~~`apps/web/src/functions/github.ts` → `inventivezee/Meety`~~ | Resolved. Those files went with the TanStack tree in `852ee6c`. The Next app has one place for these — [apps/web/app/links.ts](apps/web/app/links.ts) — and it already uses `inventivezee/meeki`, which is correct: `inventivezee/Meety` **404s** |
| E2EE recovery keys are minted with prefix `meeki-e2ee-v1:` | Fine for a fresh product; there are no old keys to parse |

## 9. Leftover upstream links to sweep when convenient

- `hyprnote.com/x`, Discord invite links in docs/UI copy — point at your own
  socials or delete.
- `hello@meeki.ai` is now the legal-contact address in privacy/terms — set up
  MX records + a mailbox before publishing those pages.
- Google & Outlook OAuth (Nango) callback flows used to go through
  `meeki.ai/oauth/callback`, a Netlify edge function in the TanStack tree. **That
  handler no longer exists** — the Next app has no `/oauth/callback` route.
  Whoever re-enables calendar integrations has to implement it in `apps/web/app/`
  first, then register the redirect URL with each provider.
- Deliberately frozen OLD names (do not "fix"): the importer reads
  `com.hyprnote.stable`/`com.hyprnote.nightly` to import Hyprnote v0 data; the
  CLI and storage crates check `anarlog`/`hyprnote` data dirs as legacy
  fallbacks; `hypr-llm.gguf` is a remote artifact name.
