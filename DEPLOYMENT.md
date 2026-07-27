# Meeki deployment runbook

What to set up, in what order, to bring `meeki.org` online. Nothing here blocks
local development or the desktop app: the current build points `VITE_API_URL`
and `VITE_APP_URL` at localhost, cloud features are opt-in, and the app is
local-first by design. Until these steps are done, sign-in/Pro, hosted share
links, CloudSync, and the docs links in the UI are simply dead.

## 0. What works today with no infrastructure

- Recording, on-device transcription, on-device summaries, notes, calendar,
  export, CLI/MCP — everything local.
- Model downloads (Hugging Face directly).
- What does NOT work: sign-in (needs Supabase), Pro entitlements (Stripe),
  share links and CloudSync (needs the API), `docs.meeki.org` help links (404
  until docs are deployed), auto-updates (endpoint deliberately empty).

## 1. DNS (registrar for meeki.org)

| Record | Host | Points to | For |
|--------|------|-----------|-----|
| A/ALIAS | `meeki.org` | Netlify load balancer | web app |
| CNAME | `www` | Netlify site | redirect to apex |
| CNAME | `docs` | Mintlify (`cname.mintlify.app` — confirm in dashboard) | docs |
| CNAME | `api` | Fly.io app hostname | API |

Add each only when the service below is live; a dangling CNAME helps nobody.

## 2. meeki.org — web app (Netlify)

Config is already in [netlify.toml](apps/web/netlify.toml); `VITE_APP_URL` is
already `https://meeki.org`.

1. Create a Netlify site from this repo; it picks up `apps/web/netlify.toml`.
2. Set the custom domain `meeki.org` (+ `www` redirect) in Site settings.
3. Fix the leftovers in `netlify.toml`:
   - `remote_images` still allowlists `hyprnote.com`, `char.com`, and
     upstream's Supabase project (`ijoptyyjrfqwaqhyxkxj.supabase.co`). Replace
     with your own Supabase project host once created (step 4).

## 3. docs.meeki.org — docs (Mintlify)

The `docs/` directory is a Mintlify site; [docs.json](docs/docs.json) already
declares `"name": "Meeki"` and canonical `https://docs.meeki.org`.

1. Create a Mintlify project pointed at this repo, docs root `docs/`.
2. Set the custom domain `docs.meeki.org`; add the CNAME it gives you.
3. Until then, every `docs.meeki.org/...` link inside the desktop app 404s —
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

## 5. api.meeki.org — API server (Fly.io)

`apps/api` has a `Dockerfile` and `fly.toml`, **but `fly.toml` still says
`app = 'hyprnote-ai'` — that is upstream's Fly app name and must be changed**
before `fly deploy` (e.g. `app = 'meeki-api'`).

1. `fly launch` from `apps/api` (or edit `fly.toml` and `fly deploy`).
2. Set secrets per `crates/api-env` / PRD §10.2: `SUPABASE_*`, `STRIPE_*`,
   STT/LLM provider keys for the proxies, `SQLITECLOUD_*` if using CloudSync,
   optional `POSTHOG_API_KEY` / `SENTRY_DSN`.
3. `fly certs add api.meeki.org`, then add the CNAME.
4. Point the desktop at it: set `VITE_API_URL=https://api.meeki.org` in
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

## 8. Leftover upstream links to sweep when convenient

- `hyprnote.com/x`, Discord invite links in docs/UI copy — point at your own
  socials or delete.
- `.github/workflows/*` reference repo secrets by name; any secret renamed to
  `MEEKI_*` must also be renamed in GitHub → Settings → Secrets before those
  workflows run.
- GitHub OAuth apps / Google & Outlook OAuth (Nango) redirect URLs are
  registered on the provider side under upstream's domains — re-register under
  meeki.org when enabling those integrations.
