# Meeki naming & independence audit
Every naming site assessed under three stated assumptions: **zero users**, **all infrastructure created from scratch**, **no dependency on the old project or its servers**. 111 contract sites classified by four parallel auditors on 2026-07-26 (branch `chore/rebrand-meeki`).
| Class | Sites | Meaning |
|---|---|---|
| UPSTREAM-DEPENDENCY | 27 | must be severed for independence |
| NOW-SAFE-RENAME-CANDIDATE | 17 | now safe to rename (zero users, fresh DBs) |
| DEAD-CODE-CANDIDATE | 20 | deletable |
| EXTERNAL-TO-CREATE | 18 | Meeki names waiting on external objects you must create |
| SELF-CONSISTENT-CONTRACT | 17 | verified consistent, keep in sync |
| INERT | 12 | no action ever |

> ## Addendum — `apps/web` was replaced on 2026-08-07
>
> This audit is a snapshot taken against the TanStack Start web app. That entire
> tree was removed in `852ee6c` and `apps/web` is now the Next.js/vinext site
> that actually serves meeki.ai. The findings below are left unedited so the
> snapshot stays intact, but **52 lines cite `apps/web` paths and all but three
> of those files no longer exist**: 39 cite `apps/web/src/…`, 13 cite
> `apps/web/netlify.toml`, 5 cite `apps/web/content/…`.
>
> How to read the affected findings now:
>
> - **`apps/web/src/…` — moot as written.** The whole directory is gone. Every
>   finding about `functions/github*.ts`, `lib/download.ts`, `lib/team.ts`,
>   `telemetry.ts`, `routes/index.tsx` testimonials, `routes/discord.tsx`,
>   `env.ts`, `functions/app-origin.ts`, deep-link scheme lists and the
>   `api/assets.$.ts` proxy no longer has code to change. If any of that
>   behaviour is wanted again it has to be rewritten, not renamed. The Next app
>   has exactly one URL constant file: `apps/web/app/links.ts`, already on
>   `inventivezee/meeki`.
> - **`apps/web/netlify.toml` — moot.** The site is on Cloudflare Workers; there
>   is no Netlify config and no Netlify site. The hyprnote.com→char.com→meeki.org
>   redirect blocks, the `remote_images` allowlist and the docs proxies all went
>   with it. The legacy-domain redirects were **never live** and any equivalent
>   would now be Cloudflare bulk redirects.
> - **`apps/web/public/llms.txt` — resolved and improved.** Now served at
>   `/llms.txt`. Every URL was re-verified; the nine `docs.meeki.ai` links were
>   dropped because that host is NXDOMAIN, and the GitHub link moved off
>   `inventivezee/Meety`, which 404s.
> - **`apps/web/content/legal/{privacy,terms}.mdx` — STILL LIVE AND STILL VALID.**
>   These two files survived into `apps/web/content/` and the
>   `Fastrepl, Inc.` finding is unchanged and unfixed. Five occurrences, one of
>   them all-caps (`FASTREPL, INC.` in the limitation-of-liability clause), so
>   search case-insensitively. Nothing serves them today, which is the only
>   reason this is not user-facing.
> - **`apps/web/README.md` and `apps/web/vite.config.ts` exist but are different
>   files.** They belong to the Next app; findings about the old ones do not
>   apply.
> - **`meeki.org` findings — the domain has no DNS record at all.** The live site
>   is `meeki.ai`. Anything describing `meeki.org` as the web origin, or a
>   Netlify site behind it, describes something that was never built.
> - **`packages/changelog` findings still stand** — that package is unchanged and
>   still consumed by `apps/desktop`, including the `auth.hyprnote.com` image
>   rewrite at `src/process.ts:40`.


## Upstream dependencies — must be severed for independence

### CrabNebula Cloud app slug `fastrepl/hyprnote2` — .github/workflows/desktop_cd.yaml:26, .github/workflows/desktop_publish.yaml:10 (consumed by .github/actions/cn_release/action.yaml

<details><summary>full anchor list</summary>

CrabNebula Cloud app slug `fastrepl/hyprnote2` — .github/workflows/desktop_cd.yaml:26, .github/workflows/desktop_publish.yaml:10 (consumed by .github/actions/cn_release/action.yaml and cn_download/action.yaml)

</details>

**Impact:** CI/publish load-bearing: any stable/nightly publish run targets upstream's CrabNebula app and fails without their API key (or worse, would publish into their channel). DEPLOYMENT.md:108 already flags it. Must change together: both workflow env vars + apps/web/src/lib/download.ts if you move to CN-hosted downloads.

**Action:** Create your own CrabNebula Cloud app (or drop CN entirely and publish DMGs as GitHub Release assets on inventivezee/Meety) and update both workflows in one commit.

### Cloudflare R2 bucket `s3://hyprnote-build/desktop/staging/` — .github/workflows/desktop_cd.yaml:199, .github/workflows/download_staging.yaml:19,30 (endpoint via secrets.CLOUDFLARE_

<details><summary>full anchor list</summary>

Cloudflare R2 bucket `s3://hyprnote-build/desktop/staging/` — .github/workflows/desktop_cd.yaml:199, .github/workflows/download_staging.yaml:19,30 (endpoint via secrets.CLOUDFLARE_R2_ENDPOINT_URL)

</details>

**Impact:** CI load-bearing for the staging channel: uploads/downloads target upstream's R2 bucket name; with your own R2 credentials the bucket won't exist. Must change together: bucket name in both workflows, the `hyprnote-staging-*` filename prefix (desktop_cd.yaml:196, download_staging.yaml:21,44), and the three CLOUDFLARE_R2_* secrets.

**Action:** Create your own R2 bucket (e.g. meeki-build), rename bucket+prefix in both workflows atomically, set new secrets.

### Infisical workspaceId 87dad7b5-72a6-4791-9228-b3b86b169db1 — .infisical.json:2, echoed in Taskfile.yaml:162 comment; read at CI time by .github/workflows/stripe_cd.yaml:35 and used

<details><summary>full anchor list</summary>

Infisical workspaceId 87dad7b5-72a6-4791-9228-b3b86b169db1 — .infisical.json:2, echoed in Taskfile.yaml:162 comment; read at CI time by .github/workflows/stripe_cd.yaml:35 and used as INFISICAL_PROJECT_ID pattern in llm_e2e.yaml:21,35 and stt_e2e.yaml:108,164

</details>

**Impact:** CI load-bearing: secret export/run steps authenticate against upstream's Infisical workspace; with your own Infisical token they 403. Must change together: .infisical.json, the Taskfile comment, and the INFISICAL_TOKEN/INFISICAL_PROJECT_ID GitHub secrets (paths /meeki/llm, /meeki/stt can stay).

**Action:** Create your own Infisical project, replace the workspaceId in .infisical.json, set new secrets.

### Fly app name `hyprnote-ai` — apps/api/fly.toml:1; .github/workflows/api_cd.yaml:127 (flyctl secrets import --app hyprnote-ai), :139 (flyctl logs --app hyprnote-ai)

**Impact:** Fly app names are globally unique and this one belongs to upstream's Fly org — `flyctl deploy` under your account will fail (name taken). Must change together: fly.toml app name + both --app flags in api_cd.yaml, plus render.yaml service name if you keep that blueprint.

**Action:** Rename to a Meeki-owned Fly app (e.g. meeki-api) in fly.toml and api_cd.yaml in one commit; create the app in your Fly org.

### Fly app name `hyprnote-stripe` — apps/stripe/fly.toml:6; .github/workflows/stripe_cd.yaml:53 (flyctl secrets set --app hyprnote-stripe), :63 (flyctl ssh console --app hyprnote-stri

<details><summary>full anchor list</summary>

Fly app name `hyprnote-stripe` — apps/stripe/fly.toml:6; .github/workflows/stripe_cd.yaml:53 (flyctl secrets set --app hyprnote-stripe), :63 (flyctl ssh console --app hyprnote-stripe)

</details>

**Impact:** Same as hyprnote-ai: deploys target an app name owned by upstream. Must change together: fly.toml + both --app flags in stripe_cd.yaml.

**Action:** Rename to meeki-stripe (or similar) atomically across fly.toml and stripe_cd.yaml.

### openstatus.yaml (monitors 7697/8351/8354/8355 → https://char.com and https://api.char.com/health) + openstatus.lock (same URLs, lines 22-91) + .github/workflows/openstatus.yaml whi

<details><summary>full anchor list</summary>

openstatus.yaml (monitors 7697/8351/8354/8355 → https://char.com and https://api.char.com/health) + openstatus.lock (same URLs, lines 22-91) + .github/workflows/openstatus.yaml which runs `openstatus monitors apply` on every push to main touching these files

</details>

**Impact:** CI load-bearing: with an OPENSTATUS_API_KEY secret set, pushes would try to (re)configure uptime monitors for upstream's product domains; monitor IDs belong to upstream's OpenStatus account so apply fails or mutates the wrong account. Must change together: openstatus.yaml URLs/names/IDs, openstatus.lock, and your own OPENSTATUS_API_KEY.

**Action:** Recreate monitors for meeki.org/api.meeki.org in your own OpenStatus account (fresh IDs), or delete all three files.

### render.yaml — OTEL_ALLOWED_ORIGIN_APP=https://char.com (line 19), OTEL_ALLOWED_ORIGIN_WWW=https://www.char.com (line 21), and web service named `hyprnote-api` (line 40)

**Impact:** If this Render blueprint is deployed, the OTel ingest CORS allowlist admits upstream's domain and rejects meeki.org, so browser telemetry from your own site is blocked; the service name is old-brand. Must change together: both origin values (→ https://meeki.org / https://www.meeki.org) and the service name.

**Action:** Edit render.yaml origins and service name before first Render deploy, or delete if you won't self-host the OTel collector.

### apps/web/netlify.toml:15-19 — Netlify Image CDN remote_images allowlist: https://char.com/.*, https://hyprnote.com/.*, https://ijoptyyjrfqwaqhyxkxj.supabase.co/.*

**Impact:** Deploy-time config: your image CDN would proxy/cache images from upstream's product domains and from a Supabase project you don't own; images referencing your new Supabase project would 403 at the CDN layer. Must change together with the new Supabase project host (see next item).

**Action:** Replace the list with your own <project-ref>.supabase.co (and any own media hosts); drop char.com/hyprnote.com entries.

### Pinned Supabase project host https://ijoptyyjrfqwaqhyxkxj.supabase.co — .agents/skills/qa-critical-ux/scripts/run-native-dev-qa.sh:18 (qa_expected_supabase_url, hard QA gate at :37

<details><summary>full anchor list</summary>

Pinned Supabase project host https://ijoptyyjrfqwaqhyxkxj.supabase.co — .agents/skills/qa-critical-ux/scripts/run-native-dev-qa.sh:18 (qa_expected_supabase_url, hard QA gate at :372-373) and apps/web/netlify.toml:18

</details>

**Impact:** Under the fresh-infra assumption this project ref cannot be yours. Left as-is, the qa-critical-ux skill hard-fails ('Unexpected production Supabase project') the moment you deploy against your own Supabase, and the Netlify image allowlist points at a foreign project. Must change together: run-native-dev-qa.sh:18 + netlify.toml:18 + the VITE_SUPABASE_URL/ANON_KEY GitHub secrets (desktop_cd.yaml:149-150, desktop_ci.yaml:173-174) + SUPABASE_PROJECT_ID secret (db_cd.yaml:11).

**Action:** After creating your Supabase project, update both hardcoded sites and all Supabase secrets in one cut.

### Web admin/content pipeline hardwired to GitHub repo fastrepl/char — apps/web/src/functions/github-content.ts:7 (GITHUB_REPO), :1169 (head=fastrepl:), :1249 (head: fastrepl:branch);

<details><summary>full anchor list</summary>

Web admin/content pipeline hardwired to GitHub repo fastrepl/char — apps/web/src/functions/github-content.ts:7 (GITHUB_REPO), :1169 (head=fastrepl:), :1249 (head: fastrepl:branch); apps/web/src/routes/api/media-upload.ts:5; apps/web/src/routes/api/webhooks/slack-interactive.ts:6; apps/web/src/routes/api/admin/content/history.ts:52; apps/web/src/routes/api/admin/content/list.ts:25

</details>

**Impact:** Runtime load-bearing: the deployed web app's admin CMS reads content from, uploads media to, and opens PRs against upstream's repo. With your GITHUB_TOKEN it 404s/403s; worst case it files PRs on a repo you don't control. All six constants must move together to the same repo.

**Action:** Point all six to inventivezee/Meety (or your new org/repo) in one commit; verify the PR head-owner strings (`fastrepl:`) match the new owner.

### apps/web/src/functions/github-stars.ts:5-6 (FASTREPL_ORG='fastrepl', CHAR_REPO='fastrepl/char'), :390 (api.github.com/orgs/fastrepl/events), :467,:498 (lead-qualification prompt ab

<details><summary>full anchor list</summary>

apps/web/src/functions/github-stars.ts:5-6 (FASTREPL_ORG='fastrepl', CHAR_REPO='fastrepl/char'), :390 (api.github.com/orgs/fastrepl/events), :467,:498 (lead-qualification prompt about Char/Fastrepl employees)

</details>

**Impact:** Runtime: the stargazer/lead-gen function polls upstream's org events and scores leads for the old company. Left as-is it silently collects data about the wrong project.

**Action:** Repoint to your own org/repo and rewrite the prompt, or delete the lead-gen path entirely.

### apps/web/src/functions/github-projects.ts:3-4 — MARKETING_REPO_OWNER='fastrepl', MARKETING_REPO_NAME='marketing'

**Impact:** Runtime: marketing/projects data is fetched from upstream's private marketing repo via your GITHUB_TOKEN — will 404 and the feature renders empty or errors.

**Action:** Repoint to an owned repo or delete the function and its consumers.

### crates/api-support/src/github.rs:8-9 — GITHUB_OWNER='fastrepl', GITHUB_REPO='char' for in-app bug-report issue filing

**Impact:** Runtime: the support API files user bug reports as GitHub issues in upstream's repo. With your token it 403s; if a permissive token were used, user diagnostics would leak to a repo you don't control.

**Action:** Point to your own repo and prune DEFAULT_ISSUE_LABELS (lines 10-22) to labels that exist there.

### packages/agent-support/src/modal/sandbox.ts:35 — Modal sandbox image bakes `git clone https://github.com/fastrepl/hyprnote.git`

**Impact:** Runtime (agent-support feature): every sandbox build clones upstream's public repo, so agents operate on Hyprnote's code, not yours.

**Action:** Clone inventivezee/Meety (public) or vendor the needed files into the image.

### crates/exedev — assets/claw-setup.sh:4 default CLAW_REPO=https://github.com/fastrepl/char; src/commands.rs:420 image ghcr.io/fastrepl/char-claw:latest (asserted at :430)

**Impact:** Runtime for the exedev/claw tooling: installs from and runs a container image published under upstream's GHCR org — private/unavailable to you, and code you don't control executes if it is available.

**Action:** Publish your own image + repo default, or delete the exedev claw path if unused in Meeki.

### Cargo git dependencies on upstream forks — Cargo.toml:351 async-openai = git https://github.com/fastrepl/async-openai (pinned rev), Cargo.toml:355 gbnf-validator = git https://gith

<details><summary>full anchor list</summary>

Cargo git dependencies on upstream forks — Cargo.toml:351 async-openai = git https://github.com/fastrepl/async-openai (pinned rev), Cargo.toml:355 gbnf-validator = git https://github.com/fastrepl/gbnf-validator (rev 3dec055); locked in Cargo.lock:1316,6403

</details>

**Impact:** Build-time: every build fetches from repos in upstream's GitHub org. Pinned revs prevent silent code changes, but availability (repo deletion/privatization) is outside your control — the build then breaks with no recourse.

**Action:** Fork both repos into your own org (or vendor/patch) and update Cargo.toml + Cargo.lock together.

### Taskfile.yaml:166 — supabase-start curls supabase/config.toml from gist.githubusercontent.com/yujonglee/... (upstream maintainer's personal gist)

**Impact:** Dev-time load-bearing: local Supabase bootstrap fetches config from an individual's gist; it can vanish or change silently and you'd be executing config you don't control.

**Action:** Vendor the supabase-default.toml into the repo and read it locally.

### apps/web/src/routes/discord.tsx:6 — /discord route 302s to https://discord.gg/Vk882WS3gF (upstream's Discord server); DEPLOYMENT.md:113 already notes this

**Impact:** Runtime/user-facing: your site funnels users into the old project's community server.

**Action:** Create your own Discord server and swap the invite, or delete the route.

### apps/desktop/flatpak/com.meeki.Meeki.metainfo.xml:31-33 — bugtracker/vcs-browser/contribute URLs → github.com/fastrepl/char; :36 developer name 'Fastrepl' (shipped via .github/work

<details><summary>full anchor list</summary>

apps/desktop/flatpak/com.meeki.Meeki.metainfo.xml:31-33 — bugtracker/vcs-browser/contribute URLs → github.com/fastrepl/char; :36 developer name 'Fastrepl' (shipped via .github/workflows/submit_flathub.yaml)

</details>

**Impact:** Infra-facing metadata: a Flathub submission would publish com.meeki.Meeki whose store links point at upstream's repo and name upstream as developer. Must change together with any Flathub submission.

**Action:** Point all three URLs at inventivezee/Meety and set the developer name to Meeki before submitting to Flathub.

### packages/changelog/content/AGENTS.md:46 — `gh api repos/fastrepl/char/compare/<>...<>` in the changelog-authoring instructions used by the release skill

**Impact:** Release tooling: agents writing changelogs would diff upstream's repo instead of yours, producing changelogs for the wrong project.

**Action:** Change to repos/inventivezee/Meety/compare (keep in sync with the release-new-version skill).

### Legal entity 'Fastrepl, Inc.' in user-facing legal content — apps/web/content/legal/privacy.mdx:9,145; apps/web/content/legal/terms.mdx:49,91,101 (also flatpak metainfo <name>Fastr

<details><summary>full anchor list</summary>

Legal entity 'Fastrepl, Inc.' in user-facing legal content — apps/web/content/legal/privacy.mdx:9,145; apps/web/content/legal/terms.mdx:49,91,101 (also flatpak metainfo <name>Fastrepl</name>)

</details>

**Impact:** Content-only but legally load-bearing: the published privacy policy and ToS name upstream's company as the data controller/IP owner for a service they don't operate. (Distinct from the LICENSE Fastrepl copyright, which must stay per MIT.)

**Action:** Rewrite both documents around the owner's legal entity before the web app goes live.

### Soniqo STT model weights — crates/transcribe-soniqo/swift-lib/src/lib.swift:50-63: HF repos aufklarer/Parakeet-EOU-120M-CoreML-INT8, aufklarer/Parakeet-TDT-v3-CoreML-INT8, aufklare

<details><summary>full anchor list</summary>

Soniqo STT model weights — crates/transcribe-soniqo/swift-lib/src/lib.swift:50-63: HF repos aufklarer/Parakeet-EOU-120M-CoreML-INT8, aufklarer/Parakeet-TDT-v3-CoreML-INT8, aufklarer/Omnilingual-ASR-CTC-300M-CoreML-INT8-10s, aufklarer/Qwen3-ASR-0.6B-MLX-4bit, aufklarer/Qwen3-ASR-1.7B-MLX-8bit, downloaded at runtime via HuggingFaceDownloader (:99); Swift package github.com/soniqo/speech-swift (Package.resolved:60)

</details>

**Impact:** Runtime model downloads go through HuggingFace Hub (public infra — NOT the critical private-host case), but the `aufklarer` namespace and the soniqo/speech-swift GitHub org are not owner-controlled: if those repos are deleted, gated, or re-uploaded with different weights, on-device STT downloads break or change behavior with no recourse.

**Action:** Mirror the five model repos into an owner-controlled HF org (and pin revisions in the downloader if the API allows); fork or vendor speech-swift, or at minimum pin it by revision (Package.resolved already pins).

### api.meeki.org DNS + cert on the owner's Fly app: DEPLOYMENT.md:65-76 documents `fly certs add api.meeki.org` + CNAME; but apps/api/fly.toml:1 says app='hyprnote-ai' and .github/wor

<details><summary>full anchor list</summary>

api.meeki.org DNS + cert on the owner's Fly app: DEPLOYMENT.md:65-76 documents `fly certs add api.meeki.org` + CNAME; but apps/api/fly.toml:1 says app='hyprnote-ai' and .github/workflows/api_cd.yaml:127,139 deploy/import secrets to --app hyprnote-ai (likewise stripe_cd.yaml:53,63 targets hyprnote-stripe)

</details>

**Impact:** The Meeki-named half (api.meeki.org) is external-to-create, but the deploy target is still upstream's Fly app name. Running api_cd with the owner's FLY_API_TOKEN fails (no such app) or, worse, would target an app they don't own. Must change together: apps/api/fly.toml:1, api_cd.yaml:127 and :139, stripe_cd.yaml:53 and :63, plus creating the Fly apps and the api.meeki.org cert/CNAME.

**Action:** Create own Fly apps (e.g. meeki-api, meeki-stripe), rename in fly.toml + both workflows, add api.meeki.org cert and CNAME.

### meeki.org/discord vanity link: docs/help.mdx:33, docs/troubleshooting.mdx:47 -> web route apps/web/src/routes/discord.tsx:6 which redirects to https://discord.gg/Vk882WS3gF

**Impact:** The /discord route itself is self-consistent once meeki.org exists, but the discord.gg invite it forwards to is the old project's Discord server — new users would land in Hyprnote/Char's community.

**Action:** Create own Discord server and replace the invite code in discord.tsx:6, or remove the /discord links from docs.

### CrabNebula pipeline feeding those GitHub releases: CN_APPLICATION="fastrepl/hyprnote2" (.github/workflows/desktop_cd.yaml:26, desktop_publish.yaml:10) with CN_API_KEY secret; relea

<details><summary>full anchor list</summary>

CrabNebula pipeline feeding those GitHub releases: CN_APPLICATION="fastrepl/hyprnote2" (.github/workflows/desktop_cd.yaml:26, desktop_publish.yaml:10) with CN_API_KEY secret; release assets downloaded from it as hyprnote-macos-{aarch64,x86_64}.dmg (desktop_cd.yaml:267,276,282-288) and char-macos-*.dmg (desktop_publish.yaml:95,104,110-111,121)

</details>

**Impact:** The entire stable-release path drafts/uploads/publishes/downloads through upstream's CrabNebula application slug. With the owner's own CN_API_KEY it fails (no access to fastrepl/hyprnote2); with no key the workflows can't run. Must be severed: either create an owner CrabNebula app and change CN_APPLICATION in both workflows, or cut CrabNebula entirely and upload the locally-built DMGs straight to the GitHub release (the updater is disabled, so nothing needs CN's update CDN).

**Action:** Replace or remove the cn_draft/cn_release/cn_download steps; while doing so rename the asset files (see next entry).

### UI-visible old-brand strings today: (1) apps/web/src/routes/index.tsx:178-179,273 — every testimonial card visibly renders "Name context: Hyprnote became Char, then Meeki." (delibe

<details><summary>full anchor list</summary>

UI-visible old-brand strings today: (1) apps/web/src/routes/index.tsx:178-179,273 — every testimonial card visibly renders "Name context: Hyprnote became Char, then Meeki." (deliberate provenance note for old tweets, but it names the old products on the landing page and the testimonials themselves are about the old product); (2) packages/changelog/content/1.0.8.md:52, 1.0.14.md:3-7 ("Hyprnote is now Char" banner), 1.0.30.md:26, 1.0.32.md:23, AGENTS.md:63 — historical changelog pages served by the web app describe the other product's rename history; (3) packages/changelog/src/process.ts:40 rewrites changelog images to https://auth.hyprnote.com/... (old project's Supabase storage — images break or leak traffic to upstream when it dies), same for apps/web/src/routes/api/assets.$.ts:5-6

</details>

**Impact:** (1) is a product decision — testimonials for a different product under a fresh brand; (2)+(3) mean the public changelog both narrates the old project's history and hot-links the old project's Supabase storage: content disappears whenever upstream rotates that bucket. For a from-scratch project the pre-fork changelog entries are dead content; the asset proxy must point at the owner's own storage.

**Action:** Rehost or drop pre-fork changelog entries and their auth.hyprnote.com images; decide whether old-product testimonials belong on the new landing page

### packages/agent-support hyprnote-repo tool: packages/agent-support/src/tools/understand-hyprnote-repo.ts:4-24 and src/modal/sandbox.ts:10,35 — support agent clones https://github.co

<details><summary>full anchor list</summary>

packages/agent-support hyprnote-repo tool: packages/agent-support/src/tools/understand-hyprnote-repo.ts:4-24 and src/modal/sandbox.ts:10,35 — support agent clones https://github.com/fastrepl/hyprnote.git and answers questions about THAT codebase

</details>

**Impact:** The support agent would explain the old project's code to users of the new one, and depends on the upstream GitHub repo existing. Must be repointed at the owner's own repo (or deleted) for independence.

**Action:** Repoint the clone URL and names at the owner's repository, or remove the tool


## Old-brand names in YOUR stack — now safe to rename (zero users, fresh DBs)

### apps/web/src/functions/github.ts:109 — fork-count fallback regex anchored to href="/fastrepl/meeki/forks" while GITHUB_ORG_REPO at :7 is already 'inventivezee/Meety'

**Impact:** The scraped repo page is inventivezee/Meety, so this fallback regex can never match — the forks fallback is silently dead. One-line fix, nothing else depends on it.

**Action:** Change the regex path segment to /inventivezee\/Meety/ (or derive it from GITHUB_ORG_REPO).

### HYPRNOTE_PROXY_DOMAINS = ["hyprnote.com", "char.com", "meeki.org"] — crates/owhisper-client/src/adapter/mod.rs:282 (runtime host classification via is_hyprnote_cloud, :284-295)

**Impact:** Runtime: any STT base_url on hyprnote.com/char.com is treated as 'our cloud proxy' (proxy auth/provider-param behavior). Zero users means no stored base_urls exist, so the old domains can be dropped in one cut. Must change together: tests in the same file (mod.rs:665-676, 841-857, 922-923) and other test fixtures that rely on api.hyprnote.com/api.char.com being classified as proxy — plugins/transcription/src/listener2/ext.rs:611,621, plugins/transcription/src/api.rs:432, crates/listener2-core/src/batch/mod.rs:415,422, crates/listener-core/src/actors/session/supervisor.rs:752, crates/owhisper-client/src/adapter/hyprnote/live.rs and per-adapter tests.

**Action:** Trim to ["meeki.org"] and rewrite all listed test fixtures to api.meeki.org in the same commit (rename the const/function too if desired — it's internal).

### GitHub secret name SENTRY_DSN_HYPRNOTE_2 — .github/workflows/desktop_cd.yaml:139, .github/workflows/desktop_ci.yaml:172

**Impact:** Only a secret name in your own repo settings; the DSN value will be your new Sentry project anyway. Must change together: both workflow references + the repo secret itself.

**Action:** Create the new Sentry project, store its DSN as SENTRY_DSN (or MEEKI_SENTRY_DSN) and update both workflows atomically.

### Old-brand CI artifact/DMG names — desktop_cd.yaml:188 (artifact hyprnote-staging-macos-*), :196 (FILENAME hyprnote-staging-*), :267,276,282-288 (hyprnote-macos-*.dmg outputs); down

<details><summary>full anchor list</summary>

Old-brand CI artifact/DMG names — desktop_cd.yaml:188 (artifact hyprnote-staging-macos-*), :196 (FILENAME hyprnote-staging-*), :267,276,282-288 (hyprnote-macos-*.dmg outputs); download_staging.yaml:21 (grep hyprnote-staging-), :44-45 (artifact name/path)

</details>

**Impact:** Self-consistent within your own CI, but the grep in download_staging.yaml:21 and the upload prefix in desktop_cd.yaml:196 are a cross-workflow contract: renaming one without the other silently finds no builds. Rename alongside the R2 bucket cut.

**Action:** Rename all hyprnote-* artifact/file prefixes to meeki-* across both workflows (and the release asset names at desktop_cd.yaml:267-288) in one commit.

### plugins/webhook/docs/webhook-openapi.json:8-9 — API contact url https://char.com / email support@char.com

**Impact:** User-facing generated API docs point support traffic at upstream. Check whether this JSON is generated (regenerate source) or handwritten; nothing else depends on the values.

**Action:** Change to meeki.org / a Meeki support address (fix the generator input if generated).

### Flatpak app id com.meeki.Meeki: apps/desktop/flatpak/com.meeki.Meeki.yml:14 (id) and :23 (command: hyprnote), com.meeki.Meeki.desktop (Exec=hyprnote, StartupWMClass=hyprnote, MimeT

<details><summary>full anchor list</summary>

Flatpak app id com.meeki.Meeki: apps/desktop/flatpak/com.meeki.Meeki.yml:14 (id) and :23 (command: hyprnote), com.meeki.Meeki.desktop (Exec=hyprnote, StartupWMClass=hyprnote, MimeType=x-scheme-handler/hypr), com.meeki.Meeki.metainfo.xml:3, tauri.conf.flatpak.json:4-5 (mainBinaryName "hyprnote", identifier com.meeki.Meeki), .github/workflows/submit_flathub.yaml:12

</details>

**Impact:** The Flathub external object (app id com.meeki.Meeki) doesn't exist yet — Flathub verification for com.meeki.* requires proving meeki.org ownership, so this is also external-to-create. The kept-for-compat binary name is now free to fix, and there is a live mismatch: the .desktop registers only x-scheme-handler/hypr while the web app emits meeki:// deep links (apps/web/src/lib/shared-notes.ts:25 default "meeki"), so share/auth deep links would never reach the Flatpak build. Must change together in one cut: tauri.conf.flatpak.json:4 mainBinaryName->meeki, com.meeki.Meeki.yml:23 command + any build rename steps, .desktop Exec/StartupWMClass/MimeType (x-scheme-handler/meeki), metainfo launchable. Separately, metainfo.xml urls (bugtracker/vcs/contribute) point at github.com/fastrepl/char and developer name "Fastrepl" — UPSTREAM leftovers to replace in the same pass.

**Action:** Rename binary to meeki + register x-scheme-handler/meeki across all four files atomically; fix metainfo URLs to inventivezee/Meety; then submit to Flathub after meeki.org domain verification.

### Old-brand DMG/artifact names in CI upload steps: desktop_cd.yaml:188 (upload-artifact name hyprnote-staging-macos-*), :196-199 (hyprnote-staging-<ts>-<sha>-macos-<arch>.dmg to s3:/

<details><summary>full anchor list</summary>

Old-brand DMG/artifact names in CI upload steps: desktop_cd.yaml:188 (upload-artifact name hyprnote-staging-macos-*), :196-199 (hyprnote-staging-<ts>-<sha>-macos-<arch>.dmg to s3://hyprnote-build/desktop/staging/), :267,276,282-288 (hyprnote-macos-*.dmg release assets); desktop_publish.yaml:95,104,110-111,121 (char-macos-*.dmg); download_staging.yaml:19-44 (reads the same bucket/prefix/pattern); desktop_ci.yaml:193 (meeki-windows-x64-nsis-* — already renamed)

</details>

**Impact:** Nothing in the repo parses these filenames except download_staging.yaml's grep on 'hyprnote-staging-.*' — the web download page links to /releases/latest, not to named assets. Zero users means no external link points at the old names. Must change together in one cut: desktop_cd.yaml:188,196,199,267,276,282-288 + desktop_publish.yaml:95,104,110-111,121 + download_staging.yaml:19-44 (bucket, prefix, grep pattern, artifact name). The R2 bucket hyprnote-build is itself external-to-create under a new name (owner's own Cloudflare R2 + CLOUDFLARE_R2_* secrets).

**Action:** Rename all artifacts to meeki-* and create an owner R2 bucket (e.g. meeki-build) in the same commit that updates both workflows.

### Legacy schemes still registered/accepted alongside meeki*: 'hyprnote' (tauri.conf.stable.json:8), 'hyprnote-staging' (tauri.conf.staging.json:9), 'hypr' + 'char' (tauri.conf.json:8

<details><summary>full anchor list</summary>

Legacy schemes still registered/accepted alongside meeki*: 'hyprnote' (tauri.conf.stable.json:8), 'hyprnote-staging' (tauri.conf.staging.json:9), 'hypr' + 'char' (tauri.conf.json:80-81), acceptance list plugins/deeplink2/src/types/share_open.rs:18 ("hyprnote" | "hyprnote-staging" | "hypr"), flatpak MimeType x-scheme-handler/hypr

</details>

**Impact:** Kept so links/handoffs from old installs keep working — but with zero users no old install exists. Registering old-brand schemes also means a Meeki install would claim URL schemes belonging to the upstream product (if a user later installs real Hyprnote, the two fight over hyprnote://). One atomic cut: remove old schemes from the three tauri confs, share_open.rs:18, and the flatpak .desktop MimeType; web never emits them (shared-notes.ts only emits meeki*), so nothing else changes.

**Action:** Drop hyprnote/hyprnote-staging/hypr/char from scheme registration and acceptance in one commit.

### Internal event name "hypr://session-deleted-for-undo": const apps/desktop/src/session/hooks/useDeleteSession.ts:27, literal duplicated in tests useDeleteSession.test.tsx:469,530

**Impact:** A window CustomEvent name, not a real deep link — never crosses a process boundary, so it works forever as-is; it is simply the last hypr:// string in app code. If renamed, change the const and the two test literals together. Cosmetically related: UI placeholder "meeki://auth/callback?..." apps/desktop/src/instruction/index.tsx:250 is display-only text (dev builds actually use meeki-dev://) — harmless.

### STT provider id "hyprnote" — registry entry apps/desktop/src/settings/ai/stt/shared.tsx:195 (id: "hyprnote", displayName "On device"); readers/writers: settings/ai/shared/on-device

<details><summary>full anchor list</summary>

STT provider id "hyprnote" — registry entry apps/desktop/src/settings/ai/stt/shared.tsx:195 (id: "hyprnote", displayName "On device"); readers/writers: settings/ai/shared/on-device-setup.tsx:272 (writes current_stt_provider:"hyprnote" into SQLite app_settings), settings/ai/stt/configure.tsx:25,43, select.tsx:595, health.tsx:65,71, settings/ai/shared/sort-providers.ts:12,18-19, settings/queries.ts:458,477, stt/capabilities.ts:56,63,74,115 (+ helper names isHyprnoteCloudSttModel/isHyprnoteLocalSttModel re-exported into sidebar/toast/index.tsx:25,62, contexts/notifications.tsx:24,69, stt/useSTTConnection.ts:16-50), stt/useRunBatch.ts:93,96,413, session/components/note-input/transcript/retranscribe-confirm.tsx:17 (matches stored per-transcript provider), auth/billing.tsx:54

</details>

**Impact:** If left as-is: harmless internally, but the old brand is baked into the stored settings value, the per-transcript provider column, and the wire query param forever. One-cut rename to e.g. "on_device" must change together: (a) all desktop TS sites above plus tests — stt/capabilities.test.ts:103-105, stt/useRunBatch.test.ts:164,494,578, stt/useStartListening.test.ts:435,1249,2693-2849, stt/capture-lifecycle-storage.test.ts:37, settings/ai/stt/selection.test.ts:20,147-163, settings/ai/shared/selection.test.ts:18-19, sort-providers.test.ts:11,17, contexts/notifications.test.tsx:33-47, sidebar/toast/index.test.tsx:103, meeting-float/host.test.ts:589-609, store/zustand/listener/general-batch.test.ts (9 sites), general.test.ts:1644, ai/model-settings.test.ts:40, shared/config/configure-assemblyai.test.ts:52, configure-venice.test.ts:57; (b) Rust: crates/owhisper-client/src/adapter/mod.rs:429 (#[strum(serialize="hyprnote")] AdapterKind::Hyprnote) + adapter/hyprnote/batch.rs:13 and live.rs:10 (provider_name "hyprnote") + provider-param injection crates/owhisper-client/src/batch.rs:76,139,159 and live.rs:105 + tests mod.rs:664-676,851,918,1018-1054; crates/transcribe-proxy/src/hyprnote_routing.rs:204,234 (should_use_hyprnote_routing(provider_param==Some("hyprnote"))), routes/streaming/mod.rs:157,190, routes/mod.rs:69,96,130, routes/batch/sync.rs:109; crates/listener2-core/src/lib.rs:39,78,151-200; crates/listener-core/src/actors/session/supervisor.rs:750 (test name); (c) API docs: crates/owhisper-interface/src/openapi.rs:6 ("Use 'hyprnote' for automatic routing") then regenerate apps/api/openapi.gen.json:1379,1498 and packages/api-client/src/generated/types.gen.ts:2169,2220; (d) docs: .agents/skills/qa-critical-ux/SKILL.md:287. Zero users + fresh DB means no stored-value migration shim is needed anywhere.

**Action:** Rename in one atomic cut (suggest "on_device"); also rename the isHyprnote* helper functions, HyprnoteAdapter, hyprnote_routing.rs / routes/streaming/hyprnote.rs modules, and HyprnoteRouter for consistency

### hyprnote_pro / hyprnote_lite entitlement keys. Hardcoded checks: crates/supabase-auth/src/claims/mod.rs:48,58,62 (+tests 103-212); apps/api/src/main.rs:30 (PAID_ENTITLEMENTS), 94,1

<details><summary>full anchor list</summary>

hyprnote_pro / hyprnote_lite entitlement keys. Hardcoded checks: crates/supabase-auth/src/claims/mod.rs:48,58,62 (+tests 103-212); apps/api/src/main.rs:30 (PAID_ENTITLEMENTS), 94,104,114 (with_required_entitlement), 985; packages/supabase/src/billing.ts:54,60,90-91 (+billing.test.ts:26,39,51); crates/api-auth/src/lib.rs:178-195 (tests); crates/api-sync tests routes/mod.rs (~25 sites 1448-2459), e2ee_witness.rs:560, attachment_backups.rs:1482; apps/desktop/src/auth/billing.test.tsx:129; Supabase SQL: migrations/20260716192447_session_sharing_pro_entitlement.sql:1,12,73-322 (private.require_hyprnote_pro_entitlement + '["hyprnote_pro"]' check), 20260717060311_standardize_pro_trial_policy.sql:177,200,209, 20260716194856_delete_session_share.sql:279,518, 20260726010000_pro_grants.sql:12,63-64; tests: 000-setup-tests-hooks.sql:42,60 (tests.authenticate_as_hyprnote_pro), 003:16,63-64,242-243, 013:162,185,236 (+~12 calls), 014:204-220 (pins the function NAME in policy SQL), plus authenticate_as calls across 009/010/012/017/023; Stripe side: apps/stripe/src/scripts/stripe-backfill-entitlements.ts:34 (ENTITLEMENT_LOOKUP_KEY)

</details>

**Impact:** The key is just the Stripe feature lookup_key flowing through stripe.active_entitlements -> JWT claims -> every checker above; the auth-hook migrations (20250101000001, 20260712000002, 20260726010000) aggregate lookup_key generically so they only need the pro_grants append at :63-64 changed. Since the owner creates the Stripe account and Supabase project from scratch, renaming to e.g. meeki_pro/meeki_lite is one atomic cut: create the Stripe feature with the new lookup_key, edit the migrations in place (legal pre-first-deploy), and update every file listed. Missing any one checker silently locks Pro features (require_..._entitlement raises, PAID_ENTITLEMENTS fails) — test 014-session-share-deletion.sql:204-220 pins the SQL function name and will catch a partial rename.

**Action:** Rename keys and the require_hyprnote_pro_entitlement / authenticate_as_hyprnote_pro function names in one cut, then create the Stripe feature with the new lookup_key; alternatively accept the freeze and document it

### hyprnote.* tracing/span attribute keys (hyprnote.subsystem, hyprnote.duration_ms, hyprnote.stt.*, hyprnote.gen_ai.*, hyprnote.supabase.*, hyprnote.billing.*, hyprnote.connection.*,

<details><summary>full anchor list</summary>

hyprnote.* tracing/span attribute keys (hyprnote.subsystem, hyprnote.duration_ms, hyprnote.stt.*, hyprnote.gen_ai.*, hyprnote.supabase.*, hyprnote.billing.*, hyprnote.connection.*, hyprnote.enduser.*): apps/api/src/main.rs:435-531 (17), apps/api/src/auth.rs:33,43, crates/llm-proxy/src/handler/{mod.rs(30),streaming.rs(3),non_streaming.rs(3)}, crates/transcribe-proxy/src/{routes/streaming/mod.rs(30),relay/handler.rs(13),routes/batch/async_callback.rs(10),supabase.rs(9),routes/batch/sync.rs(7),routes/mod.rs(5),routes/callback.rs(5),routes/streaming/session.rs(4),routes/batch/mod.rs(4),routes/streaming/hyprnote.rs(3),relay/channel_split/io.rs(3),relay/channel_split/mod.rs(2),analytics.rs(2),routes/status.rs(1),relay/pending.rs(1)}, crates/api-nango/src/routes/{webhook.rs(17),disconnect.rs(5),connect.rs(4)}, crates/api-subscription/src/{supabase.rs(11),stripe.rs(5),cleanup_worker.rs(3),routes/billing.rs(1)}, crates/api-bot/src/routes/webhook.rs(8), crates/listener2-core/src/batch/{simple.rs(32),progressive/actor.rs(10),progressive/bootstrap.rs(6),mod.rs(2)}, crates/listener-core/src/actors/{session/lifecycle.rs(12),listener/adapters.rs(4),listener/stream.rs(2),session/types.rs(1)}, crates/owhisper-client adapters (dashscope/live.rs 13, mistral/live.rs 8, gladia/live.rs 7, assemblyai/live.rs 6, soniox 7, elevenlabs 4, ~1 each in argmax/cartesia/fireworks/pyannote/smallestai/whispercpp/soniox callback), crates/transcribe-soniqo/src/lib.rs(7), crates/audio-actual (mic.rs, speaker/linux.rs, speaker/windows.rs), crates/model-downloader/src/task_join.rs(1)

</details>

**Impact:** Pure observability attribute namespace; the only consumers are the owner's own (to-be-created) Sentry/Grafana/OTel backends and any saved dashboard queries, of which none exist yet. Nothing parses these keys in-repo, so a mechanical sed hyprnote.->meeki. across the listed crates is safe and self-contained; no code contract breaks if a file is missed, it just leaves mixed namespaces in traces.

**Action:** Mechanical rename hyprnote.* -> meeki.* now, before any dashboards/alerts are built against the old keys

### service.namespace "hyprnote" tags and Sentry release prefixes: apps/web/src/telemetry.ts:118, apps/desktop/src-tauri/src/lib.rs:109 + :96 (release "hyprnote-desktop@{v}"), apps/des

<details><summary>full anchor list</summary>

service.namespace "hyprnote" tags and Sentry release prefixes: apps/web/src/telemetry.ts:118, apps/desktop/src-tauri/src/lib.rs:109 + :96 (release "hyprnote-desktop@{v}"), apps/desktop/src/main.tsx:99 ("hyprnote-desktop@"), apps/api/src/observability.rs:106, apps/api/src/main.rs:585 + :565 (release "hyprnote-api@{v}")

</details>

**Impact:** Only the owner's own Sentry/OTel projects (not yet created) consume these. Desktop Rust (lib.rs:96) and desktop TS (main.tsx:99) must use the SAME release string or Sentry sessions/artifacts split across two releases — change those two together; the other four are independent.

**Action:** Rename all seven strings to the meeki namespace in one commit

### Hooks CLI arg app_hyprnote (--app-hyprnote): crates/hooks/src/event.rs:43,52,65,74, crates/hooks/src/naming.rs:19 (test), apps/desktop/src/store/zustand/listener/general-live.ts:38

<details><summary>full anchor list</summary>

Hooks CLI arg app_hyprnote (--app-hyprnote): crates/hooks/src/event.rs:43,52,65,74, crates/hooks/src/naming.rs:19 (test), apps/desktop/src/store/zustand/listener/general-live.ts:385,712, plugins/hooks/js/bindings.gen.ts:29-30 (regenerate), scripts/yabai.sh:5-20 (example hook consuming --app-hyprnote)

</details>

**Impact:** This flag name is the contract with user-authored hook scripts (BeforeListeningStarted/AfterListeningStopped receive --app-hyprnote <bundleId>). With zero users there are no scripts in the wild, so renaming to app_meeki is one cut across the five files (event.rs field names drive the flag via stringify!, so renaming the struct fields is the whole Rust change; regen bindings; update general-live.ts arg objects and the yabai.sh example).

**Action:** Rename field to app_meeki in crates/hooks/src/event.rs, regen plugins/hooks bindings, update general-live.ts and scripts/yabai.sh together

### "char" folder names in owner-controlled runtime paths: crates/cloudsync/src/bundle.rs:138 (extracts the CloudSync SQLite extension into cache_dir/char/cloudsync/…), crates/db-cli/s

<details><summary>full anchor list</summary>

"char" folder names in owner-controlled runtime paths: crates/cloudsync/src/bundle.rs:138 (extracts the CloudSync SQLite extension into cache_dir/char/cloudsync/…), crates/db-cli/src/runtime.rs:48 (default_base_dir = data_dir/char, inconsistent with apps/cli/src/db.rs which uses meeki) (+ test fixtures crates/db-cli/src/cli.rs:94-97)

</details>

**Impact:** Both are live paths the owner's own binaries write to. The cache dir is disposable (re-extracted on next run), and db-cli's default base points at a folder the desktop app never writes — meaning db-cli against a default install would silently find no database. Renaming to "meeki" is safe now and fixes the db-cli/desktop mismatch.

**Action:** Rename both to meeki; align db-cli default_base_dir with the desktop data dir convention

### Fly app names in owner-deployed configs: apps/api/fly.toml:1 app='hyprnote-ai', apps/stripe/fly.toml:1,6 app='hyprnote-stripe', echoed in CI .github/workflows/api_cd.yaml:127,139 a

<details><summary>full anchor list</summary>

Fly app names in owner-deployed configs: apps/api/fly.toml:1 app='hyprnote-ai', apps/stripe/fly.toml:1,6 app='hyprnote-stripe', echoed in CI .github/workflows/api_cd.yaml:127,139 and stripe_cd.yaml:53,63

</details>

**Impact:** The owner creates Fly apps from scratch, so these names are free to change — but fly.toml and the two workflow files must change together with the actual `fly apps create` name or deploys/secret-sets target a nonexistent (or worse, someone else's reclaimed) app name.

**Action:** Pick meeki-api/meeki-stripe, create the Fly apps under those names, and update fly.toml + both workflows in one commit

### tauri.conf.flatpak.json:4 mainBinaryName "hyprnote" (vs "meeki" elsewhere)

**Impact:** User-facing binary/process name in the Flatpak build; kept only so an existing flatpak manifest's command= keeps working — no published flatpak exists. Must change together with any flatpak manifest the owner creates (command name, desktop file).

**Action:** Rename to meeki when creating the owner's own Flatpak manifest


## Dead code serving migrations from the old products — deletable

### .github/workflows/legacy_desktop_cd.yaml — CN_APPLICATION fastrepl/hyprnote (line 32), s3://hyprnote-cache2/v0/resources/... (lines 104,107), s3://argmax/stt sidecar (line 115)

**Impact:** Entire legacy pipeline pulls bundled model resources and an STT sidecar binary from upstream's private R2/S3 buckets and publishes to upstream's original CN app; it can never succeed with your credentials. Leaving it is harmless but misleading.

**Action:** Delete legacy_desktop_cd.yaml (and .github/actions/cn_download if nothing else uses it after the CN migration).

### .github/workflows/bot_cd.yaml:17 deploys apps/bot/fly.toml — but apps/ contains no bot/ directory (api, cli, desktop, stripe, web only); bot_ci.yaml likewise

**Impact:** Workflow references a file that does not exist; a manual dispatch fails immediately. Pure dead weight from the upstream repo layout.

**Action:** Delete bot_cd.yaml and bot_ci.yaml.

### netlify.toml domain-migration redirect blocks — lines 74-151 (hyprnote.com/* → char.com/* incl. /auth and /callback/* PKCE paths) and lines 258+ (char.com/blog/* → meeki.org/blog/*

<details><summary>full anchor list</summary>

netlify.toml domain-migration redirect blocks — lines 74-151 (hyprnote.com/* → char.com/* incl. /auth and /callback/* PKCE paths) and lines 258+ (char.com/blog/* → meeki.org/blog/*)

</details>

**Impact:** These host-scoped redirects only fire if hyprnote.com or char.com are attached as domain aliases to YOUR Netlify site — domains upstream owns and will never point at you. They are inert clutter and, if a domain were ever misattached, would bounce your users' auth flows to char.com.

**Action:** Delete both migration blocks; keep only meeki.org-relative redirects.

### Upstream artifact-fetch dev scripts — scripts/download_releases.sh:11,23,26 (cn release show fastrepl/hyprnote; cdn.crabnebula.app/download/fastrepl/hyprnote/...), scripts/s3/uploa

<details><summary>full anchor list</summary>

Upstream artifact-fetch dev scripts — scripts/download_releases.sh:11,23,26 (cn release show fastrepl/hyprnote; cdn.crabnebula.app/download/fastrepl/hyprnote/...), scripts/s3/upload.sh:2 (bucket fastrepl-hyprnote-...-s3alias), scripts/s3/cp.sh:2-4 (R2 endpoint https://3db5267cdeb5f79263ede3ec58090fe0.r2.cloudflarestorage.com, buckets hyprnote-cache/hyprnote-cache2)

</details>

**Impact:** All three operate exclusively on upstream's CN app, S3 alias, and Cloudflare-account R2 endpoint; useless without their credentials. The R2 endpoint embeds upstream's Cloudflare account ID.

**Action:** Delete scripts/download_releases.sh and scripts/s3/.

### legacy/db-user/assets/thank-you.md:15 — hot-links welcome image from raw.githubusercontent.com/fastrepl/char/...

**Impact:** Legacy onboarding content that loads an asset from upstream's repo at render time; if the note is ever shown, it phones (an image request) to upstream-controlled content.

**Action:** Delete the legacy/db-user asset (or the whole legacy dir if unused).

### Old-brand marketing/community content — README.md:1,35,45 (char.com promotion, fastrepl maintainers link), apps/web/README.md:3 (StackBlitz fork of fastrepl/char), apps/web/src/lib

<details><summary>full anchor list</summary>

Old-brand marketing/community content — README.md:1,35,45 (char.com promotion, fastrepl maintainers link), apps/web/README.md:3 (StackBlitz fork of fastrepl/char), apps/web/src/lib/team.ts:10-47 (upstream team x.com profiles), apps/web/src/routes/index.tsx:105-134 (testimonial x.com links about the old product), apps/web/src/components/site-footer.tsx:7-12 (fastrepl.com logo/link)

</details>

**Impact:** Content-only, no runtime/CI coupling, but all user-facing: the site and README present the old company, team, and product endorsements as this project's. Conflicts with the 'no old-brand strings user-facing' goal.

**Action:** Rewrite README intro/maintainers, replace or remove team.ts, testimonials, and the fastrepl footer link as part of the branding pass.

### Netlify legacy-domain redirect blocks: apps/web/netlify.toml:74-256 (hyprnote.com -> char.com rules, getchar.com rules) and :258-313 (char.com -> meeki.org rules); [images] remote_

<details><summary>full anchor list</summary>

Netlify legacy-domain redirect blocks: apps/web/netlify.toml:74-256 (hyprnote.com -> char.com rules, getchar.com rules) and :258-313 (char.com -> meeki.org rules); [images] remote_images allows char.com/hyprnote.com/upstream-supabase hosts (netlify.toml:15-19)

</details>

**Impact:** These host-scoped rules only fire when hyprnote.com/char.com/getchar.com are attached as domain aliases to the owner's Netlify site — domains the owner will never own. They are inert baggage that also implies the upstream Supabase project (ijoptyyjrfqwaqhyxkxj.supabase.co) in the image CDN allowlist. Deleting them changes nothing functionally for a from-scratch meeki.org deployment.

**Action:** Delete the hyprnote.com/char.com/getchar.com redirect blocks and prune remote_images to owner-controlled hosts (own Supabase project URL once created).

### Legacy fallback/migration code intersecting the meeki contracts: LEGACY_RELEASE_APP_FOLDERS ["anarlog","hyprnote"] crates/storage/src/global.rs:8,25-31; CLI legacy dirs ["anarlog",

<details><summary>full anchor list</summary>

Legacy fallback/migration code intersecting the meeki contracts: LEGACY_RELEASE_APP_FOLDERS ["anarlog","hyprnote"] crates/storage/src/global.rs:8,25-31; CLI legacy dirs ["anarlog","hyprnote","com.hyprnote.stable"] apps/cli/src/db.rs:55; cleanup_legacy_logs "hyprnote" plugins/tracing/src/utils.rs:14-18; auth migration from hyprnote/store.json plugins/auth/src/migrate.rs:39,138+; legacy hyprnote/hypr/char scheme entries listed under the deep-link site above

</details>

**Impact:** All serve installs of the old products; with zero users none can ever fire. Deleting them simplifies the meeki contracts (resolve_app_folder collapses to meeki/bundle-id, CLI path resolution loses the loop, deeplink2 allowlists shrink to the three meeki schemes). Each deletion is local — the meeki-named sides need no change.

### Retired hosted-LLM provider "hyprnote" settings shims: apps/desktop/src/auth/billing.tsx:54,193 (auto-clears stored current_llm_provider=="hyprnote"), apps/desktop/src/shared/confi

<details><summary>full anchor list</summary>

Retired hosted-LLM provider "hyprnote" settings shims: apps/desktop/src/auth/billing.tsx:54,193 (auto-clears stored current_llm_provider=="hyprnote"), apps/desktop/src/shared/config/configure-venice.ts:35,43 (switchingFromHyprnote), apps/desktop/src/shared/config/configure-assemblyai.ts:30-44 (switchingFromHyprnote for STT), plugins/settings/src/state.rs:116,127 (test fixture value), apps/desktop/src/shared/config/configure-paid-settings.ts:2 (comment)

</details>

**Impact:** These exist solely to migrate installs whose stored settings still point at the removed hosted "Meeki Pro" LLM/STT. With zero users and a fresh DB no stored value can ever be "hyprnote", so the branches are unreachable (~30 lines). Tests pinning them: configure-venice.test.ts:57, configure-assemblyai.test.ts:52. Risk: none — the surrounding auto-select logic keeps working via its other conditions.

**Action:** Delete the switchingFromHyprnote branches and the billing.tsx RETIRED_HOSTED_LLM_PROVIDER effect plus their test cases

### Importer-from-Hyprnote: plugins/importer (src 410 lines: lib.rs:74,82, types.rs:12-114 with names "Hyprnote v0 - Stable/Nightly" and paths com.hyprnote.stable/com.hyprnote.nightly,

<details><summary>full anchor list</summary>

Importer-from-Hyprnote: plugins/importer (src 410 lines: lib.rs:74,82, types.rs:12-114 with names "Hyprnote v0 - Stable/Nightly" and paths com.hyprnote.stable/com.hyprnote.nightly, commands.rs, error.rs, ext.rs; sources/ 131 lines incl sources/hyprnote/v0.rs) + the entire legacy/ workspace it exists for: legacy/db-parser (1584 lines), legacy/db-core + legacy/db-user (2913 lines), wired via Cargo.toml:28-30, plugins/importer/Cargo.toml:18, registered in apps/desktop/src-tauri/src/lib.rs:174, Cargo dep src-tauri/Cargo.toml:49, capability apps/desktop/src-tauri/capabilities/default.json:53, JS package @meeki/plugin-importer (apps/desktop/package.json:54, plugins/importer/js)

</details>

**Impact:** ~5,100 lines of Rust whose only purpose is reading an upstream-Hyprnote v0 SQLite database out of com.hyprnote.* data dirs. No TS code calls the plugin's commands (only the package.json dependency and the capability grant exist — there is no "Import from Hyprnote" UI at all), so it is unreachable today except via devtools. No test outside the crates pins it. Deleting removes the last code paths that read com.hyprnote.* directories. Risk: near zero; cargo check after removing the workspace members + plugin registration is the whole verification.

**Action:** Delete plugins/importer and legacy/ from the workspace, remove lib.rs:174 registration, Cargo.toml entries, capability line, and the package.json dep

### updater2 legacy macOS bundle rename: plugins/updater2/src/startup_migration.rs (378 lines incl tests; maps "Hyprnote.app"/"Char.app"->"Meeki.app" at :77-79, spawns a shell+osascrip

<details><summary>full anchor list</summary>

updater2 legacy macOS bundle rename: plugins/updater2/src/startup_migration.rs (378 lines incl tests; maps "Hyprnote.app"/"Char.app"->"Meeki.app" at :77-79, spawns a shell+osascript relaunch dance), wired at plugins/updater2/src/lib.rs:47

</details>

**Impact:** Only fires when the running bundle is literally named Hyprnote*.app or Char*.app — impossible for fresh installs of Meeki.app. Its own unit tests (:207-208,360-373) pin the behavior; nothing else depends on it. Deleting removes a privileged-mv/osascript code path (a small security-surface win). Risk: none for new installs; keep the SKIP_STARTUP_MIGRATION arg removal in lib.rs:47 tidy.

**Action:** Delete startup_migration.rs and the lib.rs:47 call plus its tests

### Legacy data-dir fallbacks: crates/storage/src/global.rs:8 LEGACY_RELEASE_APP_FOLDERS=["anarlog","hyprnote"] with resolve_app_folder fallback :25-33 (tests :59-115 pin it); apps/cli

<details><summary>full anchor list</summary>

Legacy data-dir fallbacks: crates/storage/src/global.rs:8 LEGACY_RELEASE_APP_FOLDERS=["anarlog","hyprnote"] with resolve_app_folder fallback :25-33 (tests :59-115 pin it); apps/cli/src/db.rs:55 ["anarlog","hyprnote","com.hyprnote.stable"] fallback (tests :70-100); plugins/settings load_with_legacy_fallback (plugins/settings/src/state.rs:48-66, consumed by plugins/auth); plugins/tracing/src/utils.rs:8-28 cleanup_legacy_logs deleting logs from a "hyprnote" data folder; docs/calendar.mdx:54 documents ~/Library/Application Support/hyprnote

</details>

**Impact:** All exist so an old Anarlog/Hyprnote install keeps its data after rebrand. Zero users means the fallback branch can never match; worse, if a machine has upstream Hyprnote installed, Meeki would silently adopt the OTHER product's data directory (global.rs) or open its database (cli db.rs) — an actual correctness/privacy hazard for a supposedly independent app. Delete together: the two fallback lists + their tests, the tracing legacy-log cleanup, and fix docs/calendar.mdx:54 (user-visible doc bug: should be the meeki folder).

**Action:** Remove all legacy folder fallbacks and their tests; correct the docs path

### plugins/auth/src/migrate.rs (338 lines incl ~200 lines of tests): migrates auth.json/store.json from the legacy global base dir (which itself only differs when the storage legacy f

<details><summary>full anchor list</summary>

plugins/auth/src/migrate.rs (338 lines incl ~200 lines of tests): migrates auth.json/store.json from the legacy global base dir (which itself only differs when the storage legacy fallback above resolved to anarlog/hyprnote) into app_local_data_dir

</details>

**Impact:** On a fresh install legacy paths never contain files, so migrate_auth_state is a no-op; the only real work left is choosing new_auth_path. Depends on tauri_plugin_settings global_base (:42-47), which ties it to the storage legacy fallback — delete after/with that. Risk: low; keep the plain auth_path()->app_local_data_dir/auth.json resolution.

**Action:** Collapse auth_path to the non-legacy path and delete the migration + store.json extraction + tests

### plugins/local-llm/src/migrate.rs:3-16 legacy_gguf_files (moves *.gguf from the data-dir root into models/llm), called at plugins/local-llm/src/lib.rs:67

**Impact:** 16 lines; only relevant to installs that downloaded models before the models/ subdir existed (Hyprnote-era layout). No test pins it. Fresh installs always write into models_dir directly.

**Action:** Delete migrate.rs and the lib.rs:67 call

### Legacy model catalog entries Llama3p2_3bQ4 / HyprLLM / Gemma3_4bQ4: crates/local-model/src/lib.rs:20-22,33-35,56-62 (HyprLLM URL gated on MEEKI_HYPR_LLM_URL, default ""),75-77,89-9

<details><summary>full anchor list</summary>

Legacy model catalog entries Llama3p2_3bQ4 / HyprLLM / Gemma3_4bQ4: crates/local-model/src/lib.rs:20-22,33-35,56-62 (HyprLLM URL gated on MEEKI_HYPR_LLM_URL, default ""),75-77,89-91,102-104,127-131 (descriptions "Legacy Hyprnote summarization model"),148-150,173-175 (openai ids llm-meeki-llm etc.),246-248 (LocalModel::all); file name "hypr-llm.gguf" at :34; ignored dev test crates/gguf/src/lib.rs:161-170 referencing hyprnote data dir

</details>

**Impact:** These variants are excluded from SUPPORTED_MODELS (crates/local-llm-core/src/model.rs:4-12), and list_downloaded_models (local-llm-core/src/lib.rs:37-57) only matches SUPPORTED_MODELS file names, so they can never be listed, downloaded, or started — the "HyprLLM" display name is unreachable in UI. They persist only as enum variants leaked into generated TS unions (plugins/local-llm/js/bindings.gen.ts:126, plugins/local-stt/js/bindings.gen.ts:125 include "Llama3p2_3bQ4"|"Gemma3_4bQ4"|"HyprLLM"). One test references the id: apps/desktop/src/stt/capabilities.test.ts:96 (asserts it is NOT a local STT model — trivially updatable). HyprLLM's download URL was the old project's CDN (already disabled), so deleting also removes the last hook to that artifact.

**Action:** Delete the three GgufLlmModel variants and the hypr-llm.gguf/MEEKI_HYPR_LLM_URL plumbing, regen bindings, update the one test

### Legacy deep-link scheme support: apps/desktop/src-tauri/tauri.conf.stable.json:8 registers schemes ["meeki","hyprnote"], tauri.conf.staging.json:9 ["meeki-staging","hyprnote-stagin

<details><summary>full anchor list</summary>

Legacy deep-link scheme support: apps/desktop/src-tauri/tauri.conf.stable.json:8 registers schemes ["meeki","hyprnote"], tauri.conf.staging.json:9 ["meeki-staging","hyprnote-staging"]; plugins/deeplink2/src/types/share_open.rs:18 accepts hyprnote|hyprnote-staging|hypr (+test :114-116), plugins/deeplink2/src/types/mod.rs:21-22, examples/callback-server.rs:16 (SCHEME="char"); apps/web/src/functions/desktop-flow.ts:7-11 (hypr, hyprnote, hyprnote-staging, char, char-staging), apps/web/src/lib/shared-notes.ts:21-23; web tests pinning: shared-notes.test.ts:58-78, auth-redirect.test.ts:14-83, share-route-privacy.test.ts:167, auth-flow-context.test.ts:27-29,64, auth-route-privacy.test.ts:40,67; plugins/windows/src/events.rs:127 (test parses hyprnote://hyprnote.com URL)

</details>

**Impact:** Kept so auth/share links opened by old-scheme installs keep working — no such installs exist. Registering the hyprnote:// scheme in tauri.conf.stable.json is actively bad for an independent product: if a user also installs upstream Hyprnote, the OSes may route the other product's deep links (including auth handoffs) into Meeki. All senders of these links are in-repo (web app), so dropping the legacy schemes is one cut across the files listed; the meeki/meeki-staging/meeki-dev schemes stay.

**Action:** Remove hyprnote/hyprnote-staging/hypr/char/char-staging from both tauri.conf files, deeplink2 parser + tests, desktop-flow.ts, shared-notes.ts, and the web test fixtures in the same commit

### detect self-app list: crates/detect/src/list/mod.rs:25-46 — SELF_APP_NAMES includes "hyprnote","hyprnote staging","hyprnote nightly","char","char staging","char nightly" and SELF_A

<details><summary>full anchor list</summary>

detect self-app list: crates/detect/src/list/mod.rs:25-46 — SELF_APP_NAMES includes "hyprnote","hyprnote staging","hyprnote nightly","char","char staging","char nightly" and SELF_APP_PATH_SEGMENTS the matching .app paths

</details>

**Impact:** Purpose is to exclude Meeki itself from mic-using-app detection. The hyprnote/char entries only mattered when the binary still shipped under those names. Left as-is they now suppress a genuinely different third-party app (upstream Hyprnote, if a user has it installed) from meeting-detection lists — subtly wrong behavior for an independent product. No test pins these entries.

**Action:** Drop the six hyprnote/char name entries and matching path segments

### plugins/tray/src/menu_items/tray_version.rs:17-18 — channel label mapping matches product names "Char"/"Hyprnote" and "Char Staging"/"Hyprnote Staging" alongside Meeki

**Impact:** The productName is Meeki* in all shipped configs, so the old-name arms are unreachable; 2 lines, no test pins them.

**Action:** Delete the Char/Hyprnote match arms

### Legacy JSON/Markdown vault import in plugins/db: src/import/ (~3,950 lines: legacy_vault.rs 2215, mod.rs 844, cleanup.rs 475, templates.rs 244, calendars.rs 84, events.rs 90) + cra

<details><summary>full anchor list</summary>

Legacy JSON/Markdown vault import in plugins/db: src/import/ (~3,950 lines: legacy_vault.rs 2215, mod.rs 844, cleanup.rs 475, templates.rs 244, calendars.rs 84, events.rs 90) + crates/db-app/src/legacy_import.rs; runs at every startup (plugins/db/src/lib.rs:252 import_legacy_data) and GATES CloudSync on legacy_migration_verified (lib.rs:255-258, runtime.rs:856-864); commands lib.rs:210-213; UI: apps/desktop/src/settings/general/storage/legacy-cleanup.tsx (~300 lines, "Migration complete / Legacy JSON and Markdown files were removed" row) + storage/index.tsx wiring + legacy-cleanup.test.tsx

</details>

**Impact:** This migrates the pre-SQLite (Hyprnote/Anarlog-era) file-based vault into app.db. A from-scratch install has no legacy files, so the importer no-ops and immediately marks legacy_v1 verified — but it still costs a startup scan, a permanent settings row, and a CloudSync gate wired through runtime.rs. Deleting is the largest and riskiest cut in this list because CloudSync startup ordering (lib.rs:252-258) and several substantial test suites (plugins/db tests at lib.rs:326,851; the TSX tests) are built around it; the safe cut removes import/ + legacy_import.rs + the four commands/permissions + the UI row + the ensure_legacy_migration_verified gate together.

**Action:** Delete as one unit if pursuing a minimal from-scratch codebase; otherwise leave — it is functionally inert on fresh installs

### One-off Stripe operations scripts for the OLD account: apps/stripe/src/scripts/stripe-migrate-legacy-pro-prices.ts (hardcodes old live price ids price_1T2Z8Z…, price_1RsWbz…, price

<details><summary>full anchor list</summary>

One-off Stripe operations scripts for the OLD account: apps/stripe/src/scripts/stripe-migrate-legacy-pro-prices.ts (hardcodes old live price ids price_1T2Z8Z…, price_1RsWbz…, price_1TFMmI… and "new" ids price_1TqFp7…), stripe-backfill-entitlements.ts:34 (ENTITLEMENT_LOOKUP_KEY="hyprnote_pro", backfills stripe.active_entitlements for existing customers), stripe-backfill-features.ts / stripe-backfill.ts / stripe-backfill-posthog-identity.ts / stripe-backfill-billing-analytics.ts (all assume an existing populated Stripe account)

</details>

**Impact:** All are operator scripts written for the previous Stripe account's data; the price ids and the migration semantics ($25->$15 etc.) are meaningless in a fresh account. Not imported by the webhook service (apps/stripe/src/index.ts), no tests pin them. stripe-sync-entitlements.ts is the exception — it is generic (syncs whatever lookup_keys exist) and worth keeping.

**Action:** Delete stripe-migrate-legacy-pro-prices.ts and the backfill scripts; keep stripe-sync-entitlements.ts (update its docs when the entitlement key is renamed)


## Meeki names waiting on external objects you must create

### Argmax/AM model packs and HyprLLM gguf — crates/am/src/model.rs:97-105 tar_url from MEEKI_AM_PARAKEET_V2_URL / MEEKI_AM_PARAKEET_V3_URL / MEEKI_AM_WHISPER_LARGE_V3_URL (empty defau

<details><summary>full anchor list</summary>

Argmax/AM model packs and HyprLLM gguf — crates/am/src/model.rs:97-105 tar_url from MEEKI_AM_PARAKEET_V2_URL / MEEKI_AM_PARAKEET_V3_URL / MEEKI_AM_WHISPER_LARGE_V3_URL (empty default → download errors cleanly at :134-137); crates/local-model/src/lib.rs:61 MEEKI_HYPR_LLM_URL

</details>

**Impact:** Already severed from upstream S3 (comment at model.rs:98). Left as-is these model options simply can't download. If you want them, you must re-host the tar packs/gguf on your own CDN and set the four build-time env vars; checksums at model.rs:107-112 must match the re-hosted bytes. Note repo_name() still says argmaxinc/* (model.rs:29-31) — licensing of Argmax packs needs your own agreement.

**Action:** Either re-host and set MEEKI_AM_*_URL/MEEKI_HYPR_LLM_URL at build time, or remove these model choices from the UI.

### Owner-created infrastructure the repo already names correctly — meeki.org / api.meeki.org / docs.meeki.org (desktop_cd.yaml:151-152, netlify.toml:9 + docs redirects :22-70, apps/de

<details><summary>full anchor list</summary>

Owner-created infrastructure the repo already names correctly — meeki.org / api.meeki.org / docs.meeki.org (desktop_cd.yaml:151-152, netlify.toml:9 + docs redirects :22-70, apps/desktop/src-tauri/src/agents-content.md:33, apps/cli/src/mcp.rs:134); Netlify site via NETLIFY_SITE_ID (web_cd.yaml:33-50); Supabase project + SUPABASE_* secrets (db_cd.yaml:10-11); PostHog project (hardcoded public host us.i.posthog.com at apps/desktop/src/env.ts:28, apps/stripe/src/analytics.ts:14, apps/web/src/env.ts:45, apps/web/netlify/functions/posthog-account-events.mts:33 — keys all env-injected); Sentry DSNs (env-only: apps/desktop/src-tauri/src/lib.rs:82-89, apps/web/instrument.server.mjs:4); Nango account (api.nango.dev at apps/web/netlify/edge-functions/oauth-callback.ts:1); Mux account (image.mux.com at apps/web/src/functions/media-catalog.ts:49, IDs come from your DB); CrabNebula webdriver key for e2e (e2e/blackbox/wdio.blackbox.conf.ts:60-64); web downloads already at github.com/inventivezee/Meety (apps/web/src/lib/download.ts:3-7, matches git origin)

</details>

**Impact:** Left as-is nothing breaks until you stand up each service; every name/host here is either your own domain (meeki.org DNS + Netlify + Mintlify + Fly certs to create) or a public SaaS endpoint fed by secrets you will mint. No upstream coupling remains in these sites.

**Action:** Create: meeki.org DNS records (apex, api, docs), Netlify site, Mintlify docs, Supabase project, Fly apps (after the rename items above), Infisical project, PostHog+Sentry projects, Stripe, Nango, Mux, and optionally a CrabNebula account for e2e — then fill the corresponding GitHub secrets.

### meeki.org apex DNS + Netlify site: apps/web/netlify.toml:9 (VITE_APP_URL="https://meeki.org" build env), apps/web/src/env.ts:36-38 (required in prod), apps/web/src/functions/app-or

<details><summary>full anchor list</summary>

meeki.org apex DNS + Netlify site: apps/web/netlify.toml:9 (VITE_APP_URL="https://meeki.org" build env), apps/web/src/env.ts:36-38 (required in prod), apps/web/src/functions/app-origin.ts:8-9 (PUBLIC_APP_HOSTS meeki.org + www.meeki.org), .github/workflows/web_cd.yaml:33-50 (NETLIFY_AUTH_TOKEN/NETLIFY_SITE_ID secrets, --filter @meeki/web)

</details>

**Impact:** Owner must create: Netlify site (with package=apps/web set in UI per netlify.toml:2), GH secrets NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID, and DNS for meeki.org + www.meeki.org pointed at that site. Until then web_cd fails at the credential check and every absolute URL the app generates (share links, auth handoff, canonical/OG) points at an unresolvable or unowned domain.

**Action:** Create the Netlify site, add both custom domains, set the two repo secrets; also set VITE_API_URL, VITE_SUPABASE_*, VITE_POSTHOG_API_KEY in Netlify UI env since netlify.toml only pins VITE_APP_URL and apps/web/src/env.ts:39-44 requires the rest in prod.

### Desktop release builds bake VITE_APP_URL=https://meeki.org and VITE_API_URL=https://api.meeki.org: .github/workflows/desktop_cd.yaml:151-152, desktop_ci.yaml:175-176, desktop_e2e.y

<details><summary>full anchor list</summary>

Desktop release builds bake VITE_APP_URL=https://meeki.org and VITE_API_URL=https://api.meeki.org: .github/workflows/desktop_cd.yaml:151-152, desktop_ci.yaml:175-176, desktop_e2e.yaml:27,51; consumed at runtime by apps/desktop/src/shared/utils.ts:35 (buildWebAppUrl for /auth, /app/checkout, /app/portal handoffs) and ~30 VITE_API_URL call sites (apps/desktop/src/auth/cloudsync.ts:1306, settings/ai/stt/shared.tsx:199, session-sharing/index.tsx:972 etc.)

</details>

**Impact:** Sign-in, billing, integrations, CloudSync token exchange, cloud STT, and note sharing in any CI-built binary all hit these two hostnames. Until meeki.org (Netlify) and api.meeki.org (Fly) exist, every cloud feature in a shipped build dead-ends; local-only features are unaffected.

**Action:** No code change needed — create the domains/services. Keep the two CI env values in sync with the Netlify and Fly deployments.

### Share-invite email URL hardcoded in API: crates/api-sync/src/shared_notes.rs:412 formats https://meeki.org/share/invite/{invitation_id}/#token=..., sent via Loops transactional tem

<details><summary>full anchor list</summary>

Share-invite email URL hardcoded in API: crates/api-sync/src/shared_notes.rs:412 formats https://meeki.org/share/invite/{invitation_id}/#token=..., sent via Loops transactional template INVITATION_TRANSACTIONAL_ID="cmrvkrh3c0k0t0jvh80zpkk93" (shared_notes.rs:39,423) with dataVariables senderName/noteTitle/inviteUrl; receiving page exists at apps/web/src/routes/share/invite/$invitationId.tsx

</details>

**Impact:** Two external objects: (1) meeki.org web deployment serving /share/invite/* (in repo, fine once Netlify exists); (2) a Loops account + transactional template. The baked template id cmrvkrh3c0k0t0jvh80zpkk93 was created in upstream's Loops account — with the owner's own LOOPS key it will 404 and invite emails silently fail. Also note the sender-name fallback typo "An Meeki user" at shared_notes.rs:410.

**Action:** Create own Loops account + transactional template with the same three data variables, replace the constant at shared_notes.rs:39; fix "An Meeki user" while there.

### Netlify redirects/proxies to docs.meeki.org: apps/web/netlify.toml:28-33 (/skill.md 200-proxy), :35-39 (/skills 301), :41-60 (/.well-known/skills|agent-skills|vercel 200-proxies wi

<details><summary>full anchor list</summary>

Netlify redirects/proxies to docs.meeki.org: apps/web/netlify.toml:28-33 (/skill.md 200-proxy), :35-39 (/skills 301), :41-60 (/.well-known/skills|agent-skills|vercel 200-proxies with Origin=docs.meeki.org header), :62-72 (/docs and /docs/* 301s), :98 (hyprnote.com/docs/* -> docs.meeki.org)

</details>

**Impact:** All depend on docs.meeki.org resolving to a live Mintlify deployment. The 200-status proxies (/skill.md, /.well-known/*) will return 5xx/404 to agents until it exists — these are the agent-discovery endpoints the desktop-written AGENTS.md advertises.

**Action:** Create the Mintlify project + docs.meeki.org custom domain first (see docs/README.md entry); the redirect rules are then correct as-is.

### docs.meeki.org Mintlify deployment: docs/docs.json:13 canonical https://docs.meeki.org, docs/README.md:3-13 (setup instructions: docs/ dir, custom domain, docs CNAME); links baked 

<details><summary>full anchor list</summary>

docs.meeki.org Mintlify deployment: docs/docs.json:13 canonical https://docs.meeki.org, docs/README.md:3-13 (setup instructions: docs/ dir, custom domain, docs CNAME); links baked into shipped artifacts: apps/desktop/src-tauri/src/agents-content.md:33,35 (AGENTS.md the app writes into user note workspaces), apps/cli/src/mcp.rs:134 (MCP server instructions + snapshot apps/cli/src/snapshots/meeki_cli__mcp__tests__mcp_contract.snap:6), plugins/webhook/docs/webhook-openapi.json:239, skills/meeki/SKILL.md:14, packages/changelog/content/1.2.0.md:23-24, apps/web/src/routes/_view/app/-integrations-connect-flow.tsx:155

</details>

**Impact:** Owner must create: Mintlify project pointed at docs/, custom domain docs.meeki.org, docs CNAME record. Until then every help/documentation link shipped inside the desktop app, CLI MCP instructions, webhook OpenAPI, and web UI is a dead link — but nothing breaks functionally.

**Action:** Create the Mintlify project and CNAME; no repo changes needed. agents.rs:30-31 and the CLI snapshot pin these URLs in tests, so any future domain change must update agents-content.md, mcp.rs, and the snapshot together.

### SEO/sitemap/OG canonical host meeki.org: apps/web/src/lib/seo.ts:1-2 (MEEKI_SITE_URL, /og.jpg), apps/web/src/utils/sitemap.ts:38, apps/web/vite.config.ts:17 (sitemap host), apps/we

<details><summary>full anchor list</summary>

SEO/sitemap/OG canonical host meeki.org: apps/web/src/lib/seo.ts:1-2 (MEEKI_SITE_URL, /og.jpg), apps/web/src/utils/sitemap.ts:38, apps/web/vite.config.ts:17 (sitemap host), apps/web/public/robots.txt:41 (Sitemap URL), apps/web/public/llms.txt (whole file), apps/web/src/routes/__root.tsx:43,50,62 (ai-sitemap, og:url, twitter:url), apps/web/src/lib/og-image.ts:122,183 (rendered into OG images), apps/web/src/lib/shared-note-meta.ts:44 + seo.ts:14 (/api/og/share/public/* OG endpoint)

</details>

**Impact:** Pure consumers of the meeki.org DNS/Netlify object. Correct as-is once the domain is live; until then crawlers just can't reach any of it. All constants agree on https://meeki.org — keep seo.ts, sitemap.ts, vite.config.ts, robots.txt, llms.txt in sync if the domain ever changes.

**Action:** None beyond creating the domain.

### OAuth callback contract: apps/web/netlify/edge-functions/oauth-callback.ts (path /oauth/callback, 308 -> https://api.nango.dev/oauth/callback), pinned to meeki.org host in apps/web

<details><summary>full anchor list</summary>

OAuth callback contract: apps/web/netlify/edge-functions/oauth-callback.ts (path /oauth/callback, 308 -> https://api.nango.dev/oauth/callback), pinned to meeki.org host in apps/web/src/functions/oauth-callback-edge.test.ts:12

</details>

**Impact:** Owner must create: a Nango account/integration, and OAuth provider apps (Google Calendar etc.) whose authorized redirect URI is https://meeki.org/oauth/callback. Until then the calendar-integration connect flow (apps/web/src/routes/_view/app/-integrations-connect-flow.tsx:48 via api) fails at provider consent. The edge function itself deploys with the Netlify site automatically.

**Action:** Create Nango project + provider OAuth apps with the meeki.org redirect URI; configure NANGO_* secrets on the API.

### hello@meeki.org mailbox: apps/web/content/legal/terms.mdx:35,73,102; apps/web/content/legal/privacy.mdx:13,114,146; docs/help.mdx:33; docs/calendar.mdx:58; docs/troubleshooting.mdx

<details><summary>full anchor list</summary>

hello@meeki.org mailbox: apps/web/content/legal/terms.mdx:35,73,102; apps/web/content/legal/privacy.mdx:13,114,146; docs/help.mdx:33; docs/calendar.mdx:58; docs/troubleshooting.mdx:47; docs/docs.json:88 (navbar mailto)

</details>

**Impact:** Legal documents promise account-deletion requests via this address. Owner must create MX records + a mailbox (or forwarding) for hello@meeki.org. Until then, GDPR/deletion contact promised in published legal pages bounces — a compliance problem the moment real users exist.

**Action:** Set up email on meeki.org before publishing the web app.

### Hardcoded https://meeki.org/terms and /privacy in auth screen: apps/web/src/routes/auth.tsx:238,245; also crates/owhisper-client/src/adapter/mod.rs:282 includes "meeki.org" in HYPR

<details><summary>full anchor list</summary>

Hardcoded https://meeki.org/terms and /privacy in auth screen: apps/web/src/routes/auth.tsx:238,245; also crates/owhisper-client/src/adapter/mod.rs:282 includes "meeki.org" in HYPRNOTE_PROXY_DOMAINS (URLs under *.meeki.org get first-party STT-proxy handling)

</details>

**Impact:** Both are consumers of the meeki.org DNS object; correct once it exists. The owhisper allowlist also still contains hyprnote.com and char.com (upstream domains) and the constant/function names is_hyprnote_proxy are old-brand — internal names, but the two upstream domains grant first-party treatment to servers the owner doesn't control.

**Action:** Create the domain; separately consider dropping hyprnote.com/char.com from HYPRNOTE_PROXY_DOMAINS (adapter/mod.rs:282) since no owner-controlled deployment will ever live there.

### Apple signing + notarization secrets consumed when building com.meeki.* bundles: .github/workflows/desktop_cd.yaml:113-118 (APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, KEYCHAIN_

<details><summary>full anchor list</summary>

Apple signing + notarization secrets consumed when building com.meeki.* bundles: .github/workflows/desktop_cd.yaml:113-118 (APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, KEYCHAIN_PASSWORD), :141-146 (APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID, APPLE_SIGNING_IDENTITY), :164-170 (macos_notarize_dmg), plus TAURI_SIGNING_PRIVATE_KEY[_PASSWORD] :147-148 for updater-artifact signatures

</details>

**Impact:** Owner must create: own Apple Developer account + Developer ID Application certificate, app-specific password for notarytool, and a fresh Tauri updater keypair. Failure until then: desktop_cd build-macos job fails at apple_cert import or notarization. Note tauri.conf.json:88 still ships the UPSTREAM updater pubkey — harmless while updater active:false everywhere, but it must be replaced with the owner's new public key before ever enabling the updater, or updates would only verify against a key the owner doesn't hold.

**Action:** Create Apple Developer assets + generate new tauri signer keypair; replace pubkey in tauri.conf.json:88 when enabling updates.

### MEEKI_CLOUDSYNC_* runtime secrets for the API: required set enforced by .github/workflows/api_cd.yaml:87-90 (MEEKI_CLOUDSYNC_DATABASE_ID, MEEKI_CLOUDSYNC_E2EE_DATABASE_ID, MEEKI_CL

<details><summary>full anchor list</summary>

MEEKI_CLOUDSYNC_* runtime secrets for the API: required set enforced by .github/workflows/api_cd.yaml:87-90 (MEEKI_CLOUDSYNC_DATABASE_ID, MEEKI_CLOUDSYNC_E2EE_DATABASE_ID, MEEKI_CLOUDSYNC_PROTOCOL_MODE, MEEKI_CLOUDSYNC_TOKEN_TTL_SECONDS + SQLITECLOUD_*), consumed via serde-env in crates/api-sync/src/config.rs:14-20,199-235,295 and crates/api-subscription/src/config.rs:103, apps/api/src/env.rs:115; optional MEEKI_ATTACHMENT_BACKUP_GC_ENABLED apps/api/src/env.rs:20,133

</details>

**Impact:** Owner must create: SQLite Cloud project with two databases (plaintext + E2EE — config.rs:230 requires them to differ), and store the four keys under exactly these names in Infisical path /meeki/cloudsync. Failure mode: api_cd deploy hard-fails at the verify step (api_cd.yaml:114-118 'Missing required CloudSync secrets') before any Fly deploy happens — a clean, loud failure.

**Action:** Create SQLite Cloud DBs + Infisical secrets under these exact key names; keep names in sync between api_cd.yaml:87-90 and crates/api-sync/src/config.rs field names (serde derives them).

### Infisical project with paths /meeki/cloudsync + /meeki/ai (.github/workflows/api_cd.yaml:50,70,78), /meeki/llm (llm_e2e.yaml:21,35), /meeki/stt (stt_e2e.yaml:108,164), /meeki/web (

<details><summary>full anchor list</summary>

Infisical project with paths /meeki/cloudsync + /meeki/ai (.github/workflows/api_cd.yaml:50,70,78), /meeki/llm (llm_e2e.yaml:21,35), /meeki/stt (stt_e2e.yaml:108,164), /meeki/web (stripe_cd.yaml:42), authenticated via GH secrets INFISICAL_TOKEN + INFISICAL_PROJECT_ID

</details>

**Impact:** Owner must create an Infisical project mirroring exactly these five folder paths (env slugs: prod for api_cd, dev for llm/stt e2e) plus a machine token and the two GitHub secrets. Failure until then: api_cd, llm_e2e, stt_e2e, stripe_cd all fail at the infisical export/run step.

**Action:** Create the Infisical project/folders/token; the /meeki/* path names are already owner-branded and correct as-is.

### Desktop dev-only CloudSync env MEEKI_CLOUDSYNC_ALLOW_STATIC_AUTH / _E2EE_DATABASE_ID / _API_KEY / _TOKEN / _INTERVAL_MS: apps/desktop/src-tauri/src/db.rs:29-70; test-only env MEEKI

<details><summary>full anchor list</summary>

Desktop dev-only CloudSync env MEEKI_CLOUDSYNC_ALLOW_STATIC_AUTH / _E2EE_DATABASE_ID / _API_KEY / _TOKEN / _INTERVAL_MS: apps/desktop/src-tauri/src/db.rs:29-70; test-only env MEEKI_CLOUDSYNC_E2EE_DATABASE_ID, _WORKSPACE_A/B, _TOKEN_A/B, _RECOVERY_KEY_A/B in crates/db-app/tests/cloudsync.rs:19-20,379-463,714-731 (all #[ignore]d); MEEKI_CLOUDSYNC_TIMEOUT_TEST_CHILD crates/cloudsync/src/lib.rs:130 (self-set)

</details>

**Impact:** Only matter when the owner runs dev static-auth sync or the ignored E2EE verification tests; each needs the owner's own SQLite Cloud database/tokens. Unset = features cleanly disabled (db.rs returns None) and tests skipped. TIMEOUT_TEST_CHILD is INERT (test sets it for its own child process).

**Action:** Nothing until the owner runs these flows; then export with these exact names (documented in DEPLOYMENT.md:106).

### Build-time model-hosting URLs MEEKI_AM_PARAKEET_V2_URL / MEEKI_AM_PARAKEET_V3_URL / MEEKI_AM_WHISPER_LARGE_V3_URL (crates/am/src/model.rs:99-103, option_env!, default "") and MEEKI

<details><summary>full anchor list</summary>

Build-time model-hosting URLs MEEKI_AM_PARAKEET_V2_URL / MEEKI_AM_PARAKEET_V3_URL / MEEKI_AM_WHISPER_LARGE_V3_URL (crates/am/src/model.rs:99-103, option_env!, default "") and MEEKI_HYPR_LLM_URL (crates/local-model/src/lib.rs:60-61)

</details>

**Impact:** These deliberately sever the upstream S3 phone-home: unset, the Argmax model packs and legacy HyprLLM download are disabled at compile time. Owner must create their own CDN/bucket hosting the packs and set these at build time to re-enable those model options. Failure mode until then: those specific models are simply unavailable — intended behavior. Note the artifact/env still carries the old 'HYPR_LLM' name and hypr-llm.gguf — internal, deliberate.

**Action:** Optional: host packs on own CDN and set the URLs in the build environment; otherwise leave disabled.

### GitHub repo slug inventivezee/Meety as release/download source: apps/web/src/lib/download.ts:4,7 (download buttons -> releases/latest), apps/web/src/functions/github.ts:7-9,202 (st

<details><summary>full anchor list</summary>

GitHub repo slug inventivezee/Meety as release/download source: apps/web/src/lib/download.ts:4,7 (download buttons -> releases/latest), apps/web/src/functions/github.ts:7-9,202 (stars + stargazers API), README.md:5,17, docs/docs.json:74,111, docs/installation.mdx:29, docs/agents/skills.mdx:17, docs/troubleshooting.mdx:47 (issues), skills/meeki/references/setup.md:31, web articles (e.g. apps/web/content/articles/char-is-now-meeki.mdx:11,33)

</details>

**Impact:** The repo exists (it is this checkout's remote per DEPLOYMENT.md:107) but the contract only 'works' once the owner publishes GitHub Releases with DMG assets there — download.ts intentionally bypasses upstream's CrabNebula CDN (see its comment). Failure until a release exists: download buttons land on an empty releases page. If the owner later renames the repo to match the Meeki brand, every listed site changes together (GitHub redirects old slugs, so it degrades gracefully).

**Action:** Publish releases via desktop_cd/desktop_publish to this repo; optionally rename repo to inventivezee/Meeki and update all listed sites in one commit.

### MEEKI_* deployment env vars: envy-derived names from crates/api-sync/src/config.rs:14-20 (meeki_cloudsync_e2ee_database_id, meeki_cloudsync_database_id, meeki_cloudsync_protocol_mo

<details><summary>full anchor list</summary>

MEEKI_* deployment env vars: envy-derived names from crates/api-sync/src/config.rs:14-20 (meeki_cloudsync_e2ee_database_id, meeki_cloudsync_database_id, meeki_cloudsync_protocol_mode, meeki_cloudsync_token_ttl_seconds) and apps/api/src/env.rs:20 (meeki_attachment_backup_gc_enabled); pass-through list .github/workflows/api_cd.yaml:87-90; documented DEPLOYMENT.md:104-106; test-harness vars crates/db-app/tests/cloudsync.rs:19-20,379-463

</details>

**Impact:** These Rust field names ARE the env-var contract (MEEKI_CLOUDSYNC_*, MEEKI_ATTACHMENT_BACKUP_GC_ENABLED). Correct as-is once the owner creates secrets under exactly these keys in their own Infisical/Fly setup; api_cd.yaml, DEPLOYMENT.md, and the struct fields already agree. This is the one meeki_* Rust-identifier class that crosses a process boundary — excluded from the inert-ident count below.


## Meeki internal contracts — verified consistent, keep in sync

### com.meeki.dev / com.meeki.stable / com.meeki.staging / com.meeki.dev.thin bundle identifiers: apps/desktop/src-tauri/tauri.conf.json:5, tauri.conf.stable.json:5, tauri.conf.staging

<details><summary>full anchor list</summary>

com.meeki.dev / com.meeki.stable / com.meeki.staging / com.meeki.dev.thin bundle identifiers: apps/desktop/src-tauri/tauri.conf.json:5, tauri.conf.stable.json:5, tauri.conf.staging.json:5, tauri.conf.thin.json:5; runtime consumers apps/desktop/src/shared/utils.ts:16-18 (id->scheme map), apps/desktop/src-tauri/src/embedded_cli.rs:123-126 (id->CLI command name), plugins/store2/src/commands.rs:35-44,394-407 (keychain service "<id>.secure-store", maps com.meeki.Meeki->com.meeki.stable), plugins/tray/src/menu_items/tray_version.rs:13-15, plugins/tracing/src/utils.rs:14, apps/cli/src/db.rs:40-41 (data-dir per id), apps/desktop/scripts/dev-runner.mjs:46-48 (codesign designated requirement for dev TCC)

</details>

**Impact:** All sides live in this repo and agree. The external state these ids key into (macOS TCC permission grants, Keychain items named com.meeki.*.secure-store, app-data dirs) is created by the OS/app at first run — the owner creates nothing manually. Must stay in sync: the five tauri confs, shared/utils.ts map, embedded_cli.rs map, store2 commands.rs map, tray_version.rs, cli db.rs. Signing/notarizing these bundles needs only a Developer ID cert (APPLE_* secrets, see notarization entry) — no App ID registration required for Developer ID distribution.

**Action:** None; if any id ever changes, change all listed sites atomically (zero-users means no TCC/Keychain migration needed). com.meeki.nightly appears only in tests (crates/tcc/src/lib.rs:59-71, plugins/auth/src/migrate.rs:252) — INERT.

### CLI env contract MEEKI_BASE / MEEKI_DB_PATH: apps/cli/src/cli.rs:13,22 (clap env bindings); documented at docs/reference/cli.mdx:14-15, docs/installation.mdx:45, skills/meeki/refer

<details><summary>full anchor list</summary>

CLI env contract MEEKI_BASE / MEEKI_DB_PATH: apps/cli/src/cli.rs:13,22 (clap env bindings); documented at docs/reference/cli.mdx:14-15, docs/installation.mdx:45, skills/meeki/references/setup.md:39, skills/meeki/references/errors.md:9; data-dir resolution apps/cli/src/db.rs:40-48

</details>

**Impact:** Contract between the shipped CLI binary, its docs, and the agent skill — all in this repo and agreeing. Users'/agents' shells are the 'external' side but nothing must be pre-created. Must stay in sync: cli.rs env names <-> cli.mdx table <-> skill references.

**Action:** None.

### productName/mainBinaryName per channel: tauri.conf.json:3-4 (Meeki Dev/meeki-dev), tauri.conf.stable.json:3-4 (Meeki/meeki), tauri.conf.staging.json:3-4 (Meeki Staging/meeki-stagin

<details><summary>full anchor list</summary>

productName/mainBinaryName per channel: tauri.conf.json:3-4 (Meeki Dev/meeki-dev), tauri.conf.stable.json:3-4 (Meeki/meeki), tauri.conf.staging.json:3-4 (Meeki Staging/meeki-staging), tauri.conf.thin.json:3-4 (Meeki/meeki); CI consumer desktop_e2e.yaml:56 hardcodes .../release/meeki-staging binary path; embedded CLI install name per channel embedded_cli.rs:123-126; settings UI shows commandName apps/desktop/src/settings/developers/index.tsx:113,248

</details>

**Impact:** DMG volume/app names derive from productName; desktop_cd finds DMGs by glob so it tolerates any name, but desktop_e2e.yaml:56 breaks if staging mainBinaryName ever diverges from 'meeki-staging'. All sides currently agree. Exception: tauri.conf.flatpak.json:4 mainBinaryName 'hyprnote' — covered in the Flatpak entry.

**Action:** None; treat desktop_e2e.yaml:56 as the site to update if a binary name changes.

### Deep-link schemes meeki / meeki-staging / meeki-dev: OS registration via tauri.conf.stable.json:8 (["meeki","hyprnote"]), tauri.conf.staging.json:9 (["meeki-staging","hyprnote-stag

<details><summary>full anchor list</summary>

Deep-link schemes meeki / meeki-staging / meeki-dev: OS registration via tauri.conf.stable.json:8 (["meeki","hyprnote"]), tauri.conf.staging.json:9 (["meeki-staging","hyprnote-staging"]), tauri.conf.json:78-82 (["meeki-dev","hypr","char"]); producers apps/web/src/lib/shared-notes.ts:18-26 (default meeki), apps/web/src/functions/desktop-flow.ts:4-14, apps/desktop/src/session-sharing/urls.ts:97-104; consumers plugins/deeplink2/src/types/mod.rs:18-20 and share_open.rs:18,111-113 (accepts meeki* plus legacy hyprnote/hyprnote-staging/hypr)

</details>

**Impact:** The OS-level scheme registration is created automatically when the signed app is installed/first-run (Info.plist CFBundleURLTypes / Windows registry) — the owner creates nothing manually, but the contract only functions on machines where the app is installed; until then meeki:// links from meeki.org fall into the browser's 'no handler' path (web already handles this with fallback UI). Web default scheme 'meeki' <-> stable conf <-> deeplink2 acceptance must stay in sync across the five files listed. Linux/Flatpak is the broken corner (registers only hypr — see Flatpak entry).

**Action:** None for macOS/Windows; fix the Flatpak scheme registration.

### x-meeki-device-name HTTP header: producer apps/desktop/src/auth/cloudsync.ts:65, consumer crates/api-sync/src/routes/mod.rs:39

**Impact:** Desktop-to-API wire contract, both sides in repo, already Meeki-branded. Must stay byte-identical in both files.

**Action:** None.

### Agent-skill name 'meeki': skills/meeki/SKILL.md:2 (name: meeki), enforced by .github/workflows/cli_ci.yaml:111-120 (front-matter checks + `meeki` in embedded CLI skill list + mirro

<details><summary>full anchor list</summary>

Agent-skill name 'meeki': skills/meeki/SKILL.md:2 (name: meeki), enforced by .github/workflows/cli_ci.yaml:111-120 (front-matter checks + `meeki` in embedded CLI skill list + mirrored copy docs/.mintlify/skills/meeki/SKILL.md), served externally at docs.meeki.org/skill.md and proxied at meeki.org/skill.md (netlify.toml:28-33)

</details>

**Impact:** The skill name, its SKILL.md, the Mintlify mirror, and the CLI's embedded skill list are checked against each other in CI. External availability rides on the docs.meeki.org deployment (covered above). Must stay in sync: skills/meeki/SKILL.md <-> docs/.mintlify/skills/meeki/SKILL.md <-> CLI skill list.

**Action:** None.

### com.meeki.notifications GTK application id (crates/notification-linux/src/ui.rs:239) and com.meeki.Meeki D-Bus own-name (flatpak com.meeki.Meeki.yml finish-args --own-name)

**Impact:** Session-bus names claimed at runtime on the user's machine; the Flatpak sandbox permission (--own-name=com.meeki.Meeki) must match the app id, which it does. No pre-created external object. Keep the yml own-name in sync with the flatpak id if either changes.

**Action:** None.

### Deep-link schemes meeki / meeki-staging / meeki-dev: OS registration apps/desktop/src-tauri/tauri.conf.json:78-82 (dev: meeki-dev), tauri.conf.staging.json:9, tauri.conf.stable.jso

<details><summary>full anchor list</summary>

Deep-link schemes meeki / meeki-staging / meeki-dev: OS registration apps/desktop/src-tauri/tauri.conf.json:78-82 (dev: meeki-dev), tauri.conf.staging.json:9, tauri.conf.stable.json:8; producer map getScheme() apps/desktop/src/shared/utils.ts:11-20 (com.meeki.stable→meeki, .staging→meeki-staging, .dev→meeki-dev, fallback meeki-dev); web allowlist DESKTOP_SCHEMES + DEFAULT_DESKTOP_SCHEME apps/web/src/functions/desktop-flow.ts:3-14; Rust share-open allowlists plugins/deeplink2/src/types/share_open.rs:16-19 and SHARE_OPEN_PREFIXES plugins/deeplink2/src/types/mod.rs:17-24; web URL builders apps/web/src/lib/desktop-auth-handoff.ts:20, apps/web/src/routes/_view/callback/billing.tsx:46, apps/web/src/routes/_view/callback/integration.tsx:58, apps/web/src/routes/_view/app/account.tsx:55

</details>

**Impact:** All meeki-* sides agree exactly (verified string-by-string); deep-link path parsing in deeplink2 is scheme-agnostic except share/open, whose scheme allowlist is duplicated in TWO Rust places (share_open.rs:16-19 is the real gate, types/mod.rs:17-24 is only the oversize guard). Any future scheme change must touch all seven sites above together. Note the deliberately-kept LEGACY schemes are internally inconsistent: web accepts char/char-staging but share_open.rs rejects char (tested at share_open.rs:136) and no tauri.conf registers char-staging; dev conf registers hypr+char, stable registers hyprnote, staging hyprnote-staging — under zero users the whole legacy set (hypr, char, char-staging, hyprnote, hyprnote-staging) is removable in one cut across the same seven files.

### Bundle-id contract com.meeki.{dev,staging,stable}, com.meeki.Meeki (flatpak), com.meeki.dev.{thin,stt}: identifiers in tauri.conf.json:5 and tauri.conf.{staging,stable,flatpak,thin

<details><summary>full anchor list</summary>

Bundle-id contract com.meeki.{dev,staging,stable}, com.meeki.Meeki (flatpak), com.meeki.dev.{thin,stt}: identifiers in tauri.conf.json:5 and tauri.conf.{staging,stable,flatpak,thin,bundled-models}.json:5; storage folder resolution crates/storage/src/global.rs:4-8,20-34 (staging→bundle-id dir, release→"meeki"); keychain plugins/store2/src/commands.rs:33-49 (secure_store_service maps com.meeki.Meeki→com.meeki.stable, suffix .secure-store; dev accounts get v2: prefix); detect SELF_BUNDLE_IDS crates/detect/src/list/mod.rs:18-23; dev-runner codesign apps/desktop/scripts/dev-runner.mjs:46-48 (identifier + designated requirement com.meeki.dev); channel maps plugins/tray/src/menu_items/tray_version.rs:13-15, apps/desktop/src-tauri/src/embedded_cli.rs:9-13; STAGING_BUNDLE_ID duplicated in apps/desktop/src-tauri/src/lib.rs:22, src/commands.rs:3, crates/storage/src/global.rs:4, plugins/tracing/src/utils.rs:14

</details>

**Impact:** All sides agree today. Sync points to know about: the literal com.meeki.staging is duplicated in 4+ files with no shared const; dev-runner's designated requirement must match tauri.conf.json's identifier or keychain ACLs break in dev. Two benign gaps, no action needed: com.meeki.nightly appears in SELF_BUNDLE_IDS (list/mod.rs:22) and tests (crates/tcc/src/lib.rs:59-71) but no nightly channel config exists (forward-compat); com.meeki.dev.thin/.stt are absent from SELF_BUNDLE_IDS and tray_version — covered by the SELF_APP_NAMES "meeki" name match and the "dev" default. External side: the owner must create Apple signing/App IDs (and flatpak app id) for exactly these identifiers.

### Embedded-CLI naming chain: crates/xtask/src/prepare_binaries.rs:42-54 builds -p meeki-cli into resources/cli/meeki-cli-<triple>; .github/workflows/desktop_cd.yaml:112 adds external

<details><summary>full anchor list</summary>

Embedded-CLI naming chain: crates/xtask/src/prepare_binaries.rs:42-54 builds -p meeki-cli into resources/cli/meeki-cli-<triple>; .github/workflows/desktop_cd.yaml:112 adds externalBin resources/cli/meeki-cli; apps/desktop/src-tauri/src/embedded_cli.rs:140,168-173,278 resolves meeki-cli / meeki-cli-{aarch64,x86_64}-apple-darwin and installs to ~/.local/bin as "meeki"/"meeki-staging"/"meeki-dev" (embedded_cli.rs:121-127); apps/cli/src/db.rs:40-41 maps argv[0] meeki-dev→com.meeki.dev, meeki-staging→com.meeki.staging, default→data_dir/meeki/app.db (db.rs:48); apps/cli/Cargo.toml:2,7 (package meeki-cli, bin meeki); MANAGED_CLI_DIR ".meeki-cli" embedded_cli.rs:11

</details>

**Impact:** Fully coherent end-to-end and matches crates/storage/src/global.rs folder resolution (dev debug builds→com.meeki.dev dir, staging→com.meeki.staging, stable→meeki). Renaming any link (cargo bin name, xtask copy name, workflow externalBin arg, resource resolution constants, install command names, argv[0] match) requires changing all of them together.

### E2EE crypto domain strings meeki-e2ee-*: producers/consumers all in crates/e2ee/src/lib.rs:22-27 (RECOVERY_KEY_PREFIX meeki-e2ee-v1:, RECOVERY_KEY_ID_DOMAIN, WORKSPACE_KEY_SALT, FI

<details><summary>full anchor list</summary>

E2EE crypto domain strings meeki-e2ee-*: producers/consumers all in crates/e2ee/src/lib.rs:22-27 (RECOVERY_KEY_PREFIX meeki-e2ee-v1:, RECOVERY_KEY_ID_DOMAIN, WORKSPACE_KEY_SALT, FIELD_ID_DOMAIN, VALUE_TAG_DOMAIN, PAYLOAD_AAD_DOMAIN) and crates/e2ee/src/blob.rs:27-34 (8 attachment-blob domains + ANABLB01 magic); freeze tests crates/e2ee/src/lib.rs:489-496 and crates/e2ee/src/blob.rs:876-888; server-side blindness asserted at crates/api-sync/src/routes/mod.rs:1657 (response body must not contain meeki-e2ee-v1); UI placeholder apps/desktop/src/settings/general/e2ee-setup.tsx:221

</details>

**Impact:** Single-crate producers/consumers, deliberately frozen — correct to leave exactly as-is; the freeze-test comments explicitly say a rebrand must never touch them. Two freeze-coverage gaps worth closing while there is still no ciphertext: (1) crates/e2ee/src/lib.rs:119 hashes inline literal b"meeki-e2ee-key-id-v1" (workspace key-id domain) that is neither a named const nor asserted in crypto_domain_constants_are_frozen; (2) blob_crypto_constants_are_frozen omits HEADER_KEY_INFO (blob.rs:29), CHUNK_KEY_INFO (blob.rs:30), ATTACHMENT_BACKUP_REF_DOMAIN (blob.rs:33), ATTACHMENT_BACKUP_VERSION_REF_DOMAIN (blob.rs:34). If ever renamed after real data exists, all synced ciphertext/blinded ids become unreadable.

**Action:** Add the missing four blob constants and a named const for meeki-e2ee-key-id-v1 to the existing freeze tests; do not rename any domain string.

### __meeki_cloudsync_control recovery-barrier domain: single const CLOUDSYNC_RECOVERY_BARRIER_TABLE crates/db-app/src/cloudsync.rs:18; writer seals it into the cloud-persisted barrier

<details><summary>full anchor list</summary>

__meeki_cloudsync_control recovery-barrier domain: single const CLOUDSYNC_RECOVERY_BARRIER_TABLE crates/db-app/src/cloudsync.rs:18; writer seals it into the cloud-persisted barrier payload via key.seal_field at cloudsync.rs:756-770; reader verifies field.table equality after open_field at cloudsync.rs:1907-1909; all external callers go through meeki_db_app::insert/delete/cloudsync_recovery_barrier_is_exact (plugins/db/src/runtime.rs:1613,1651,1743,1959-1969)

</details>

**Impact:** Writer and reader share one const in one file, so internal drift is impossible. It is not a SQLite table name — it is a domain string sealed into E2EE payloads stored server-side, i.e. same frozen family as the meeki-e2ee-* constants but with no freeze test asserting the literal. Once a real recovery barrier exists in the owner's cloud DB, renaming it invalidates recovery state; consider adding it to a freeze test alongside the e2ee domains.

### x-meeki-* HTTP headers: x-meeki-e2ee-key-id — server const crates/api-sync/src/routes/mod.rs:37, read at :869, utoipa param :845, documented apps/api/openapi.gen.json:2885 (/sync/t

<details><summary>full anchor list</summary>

x-meeki-* HTTP headers: x-meeki-e2ee-key-id — server const crates/api-sync/src/routes/mod.rs:37, read at :869, utoipa param :845, documented apps/api/openapi.gen.json:2885 (/sync/token); client sends "X-Meeki-E2EE-Key-Id" apps/desktop/src/auth/cloudsync.ts:1296. x-meeki-device-name — client const cloudsync.ts:65, sent at :1302; server const routes/mod.rs:39, read at :1015. Companion brand-free x-device-fingerprint defined at apps/desktop/src/shared/utils.ts:49, apps/api/src/main.rs:32, apps/api/src/auth.rs:8, crates/api-sync/src/routes/mod.rs:38

</details>

**Impact:** Client/server strings agree (HTTP header names are case-insensitive, so the client's title-case form is fine). x-meeki-device-name and x-device-fingerprint are read from the raw HeaderMap and are NOT declared in openapi.gen.json (0 hits) — the generated api-client is unaffected because the desktop sends them via manual fetch headers, but the OpenAPI doc understates the /sync/token contract. If any header is renamed, change client const, server const, and the utoipa annotation together, then regenerate openapi.gen.json.

### Shared-attachment blind-ref domains: apps/desktop/src/session-sharing/attachments.ts:152 (`meeki-shared-attachment-v1\0shareId\0attachmentId`) and :155 (`meeki-shared-attachment-ve

<details><summary>full anchor list</summary>

Shared-attachment blind-ref domains: apps/desktop/src/session-sharing/attachments.ts:152 (`meeki-shared-attachment-v1\0shareId\0attachmentId`) and :155 (`meeki-shared-attachment-version-v1\0...`), hashed by deriveBlindRef (attachments.ts:718-726) before leaving the device; server treats refs as opaque validated base64url (crates/api-sync/src/routes/shared_attachments.rs:259-277, RPC p_attachment_ref/p_version_ref)

</details>

**Impact:** The desktop is the only deriver; the server/Supabase never re-derive, only compare for dedupe. Nothing else must stay in sync in-repo, but the strings are persistence-affecting: renaming after refs exist in the owner's Supabase would orphan dedupe rows (moot at zero users). Note: the identical string "meeki-shared-attachment-v1" also appears as a tus upload fingerprint in packages/supabase/src/storage.ts:303 — that is a coincidental, independent use (client-local resumption key) with no requirement to match.

### Plugin id meeki-tray: PLUGIN_NAME plugins/tray/src/lib.rs:10 (builder :15, specta plugin_name :63), TRAY_ID "meeki-tray" plugins/tray/src/ext.rs:25, scoped-store scope ext.rs:211,2

<details><summary>full anchor list</summary>

Plugin id meeki-tray: PLUGIN_NAME plugins/tray/src/lib.rs:10 (builder :15, specta plugin_name :63), TRAY_ID "meeki-tray" plugins/tray/src/ext.rs:25, scoped-store scope ext.rs:211,226, generated invoke paths plugins/tray/js/bindings.gen.ts:11,19 ("plugin:meeki-tray|..."), capability grant apps/desktop/src-tauri/capabilities/default.json:37 ("meeki-tray:default"), cargo package tauri-plugin-meeki-tray plugins/tray/Cargo.toml:2,7 + alias Cargo.toml:265, autogenerated permissions plugins/tray/permissions/autogenerated/reference.md

</details>

**Impact:** All sides agree; bindings and permissions are generated from PLUGIN_NAME so only the capabilities json and TRAY_ID are hand-maintained sync points. Verified it is the only meeki-branded plugin id — the other 40+ plugins use unbranded names (checked every PLUGIN_NAME const against the capability file's permission prefixes).

### meeki-audio-tap device sentinel: creator names the CoreAudio aggregate at crates/audio-actual/src/speaker/macos.rs:72 using pub const TAP_DEVICE_NAME crates/audio-actual/src/lib.rs

<details><summary>full anchor list</summary>

meeki-audio-tap device sentinel: creator names the CoreAudio aggregate at crates/audio-actual/src/speaker/macos.rs:72 using pub const TAP_DEVICE_NAME crates/audio-actual/src/lib.rs:19; excluders crates/audio-actual/src/lib.rs:113 (device listing filter), crates/audio-actual/src/mic.rs:18 (mic candidate exclusion), and a second, independent private const crates/audio-device/src/macos.rs:116 used at :130

</details>

**Impact:** Both constants are byte-identical today, but crates/audio-device duplicates the literal instead of importing audio-actual's — if either is ever changed alone, the app can select its own loopback tap as the microphone (exactly the failure PRD-GREENFIELD.md:90 warns about). Keep the two consts in lockstep or have audio-device reference a shared definition. The name is visible OS-wide (Audio MIDI Setup) while recording, which is why it is correctly meeki-branded.

### STT wire contract after hosted-cloud removal: desktop appends ?provider=hyprnote only when the base URL matches HYPRNOTE_PROXY_DOMAINS crates/owhisper-client/src/adapter/mod.rs:282

<details><summary>full anchor list</summary>

STT wire contract after hosted-cloud removal: desktop appends ?provider=hyprnote only when the base URL matches HYPRNOTE_PROXY_DOMAINS crates/owhisper-client/src/adapter/mod.rs:282 (["hyprnote.com","char.com","meeki.org"]) or localhost (is_hyprnote_proxy mod.rs:304); the only consumer is the owner's own transcribe-proxy (mounted in apps/api/src/main.rs:142 via with_hyprnote_routing)

</details>

**Impact:** Both sides of the provider_param contract live in this repo (owhisper-client sender, transcribe-proxy receiver) and target only the owner's future api.meeki.org — so the "hyprnote" wire value is NOT an external contract and can be renamed together with the provider id above. However hyprnote.com and char.com in HYPRNOTE_PROXY_DOMAINS mean the client would still treat the OLD project's hosts as its trusted proxy (sending the user's auth key there if ever configured); tests pin them at adapter/mod.rs:665-668.

**Action:** Drop "hyprnote.com" and "char.com" from HYPRNOTE_PROXY_DOMAINS (mod.rs:282) and their test assertions; rename the provider_param value in the same cut as the provider id


## Inert Meeki names — no action ever

### Deliberately-kept old-brand test fixtures and comments (api.hyprnote.com unit tests across crates/owhisper-client/**, plugins/transcription tests, crates/listener-core/src/actors/s

<details><summary>full anchor list</summary>

Deliberately-kept old-brand test fixtures and comments (api.hyprnote.com unit tests across crates/owhisper-client/**, plugins/transcription tests, crates/listener-core/src/actors/session/supervisor.rs:752; crates/buffer/src/lib.rs:323-453 hyprnote.com/x snapshots; crates/notification-macos example emails; crates/api-bot/src/config.rs:7 comment; packages/editor + crates/detect fixtures; plugins/windows/src/events.rs:127; .github/reports/**; eval_run.yaml:34 cache path; crates/detect/src/list/mod.rs:41-46 self-app segments)

</details>

**Impact:** None of these cross a network, build, or CI boundary — they are test inputs, examples, comments, historical reports, and defensive string matches. No action ever required; the api.hyprnote.com test URLs will be swept up anyway if you do the HYPRNOTE_PROXY_DOMAINS rename cut.

**Action:** None (optionally normalize fixtures to api.meeki.org during the proxy-domains rename).

### Local runtime knobs MEEKI_LLM_CTX_SIZE / MEEKI_LLM_THINK_BUDGET / MEEKI_LLM_SLEEP_IDLE_SECONDS (crates/local-llm-core/src/server.rs:19,24,35), build-script env MEEKI_BUNDLE_MODELS 

<details><summary>full anchor list</summary>

Local runtime knobs MEEKI_LLM_CTX_SIZE / MEEKI_LLM_THINK_BUDGET / MEEKI_LLM_SLEEP_IDLE_SECONDS (crates/local-llm-core/src/server.rs:19,24,35), build-script env MEEKI_BUNDLE_MODELS (apps/desktop/src-tauri/scripts/prepare-bundled-models.mjs:39, package.json:19) and MEEKI_LLAMA_CPP_RELEASE (prepare-llama-cpp.mjs:9, fetches public ggml-org/llama.cpp release b10067), QA-skill env MEEKI_QA_GIT_SHA / MEEKI_QA_EXPECTED_* (.agents/skills/qa-critical-ux/*)

</details>

**Impact:** User-machine or dev-machine tuning variables; no external object is named. The llama.cpp fetch targets a public third-party GitHub release, not old-project infrastructure.

**Action:** None.

### meeki.org URLs pinned in unit tests only: apps/web/src/lib/auth-redirect.test.ts:24-90, auth-flow-context.test.ts:12-62, shared-note-meta.test.ts:55-68, oauth-callback-edge.test.ts

<details><summary>full anchor list</summary>

meeki.org URLs pinned in unit tests only: apps/web/src/lib/auth-redirect.test.ts:24-90, auth-flow-context.test.ts:12-62, shared-note-meta.test.ts:55-68, oauth-callback-edge.test.ts:12, desktop-auth-handoff.test.ts:69; apps/desktop/src/session-sharing/urls.test.ts:19-107, client.test.ts:360-372, shared-notes/attachment-client.test.ts:37-82, session/meeting-link.test.ts:12-15, outer-header tests; crates/owhisper-client/src/adapter/mod.rs:669-924, plugins/transcription/src/api.rs:432, plugins/windows/src/events.rs:122

</details>

**Impact:** Test fixtures exercising URL-shape logic; they never cross a network boundary at test time and encode the same meeki.org contract as production code. No action ever; they simply co-move if the domain co-moves.

**Action:** None.

### tus upload fingerprints: "meeki-private-attachment-v1:..." packages/supabase/src/storage.ts:146 and "meeki-shared-attachment-v1:..." storage.ts:303, passed as tus-js-client fingerp

<details><summary>full anchor list</summary>

tus upload fingerprints: "meeki-private-attachment-v1:..." packages/supabase/src/storage.ts:146 and "meeki-shared-attachment-v1:..." storage.ts:303, passed as tus-js-client fingerprint with removeFingerprintOnSuccess

</details>

**Impact:** Client-local upload-resumption keys; never sent to the server and cleared on success. No action ever.

### Store-instance HMR keys __meeki_listener_store__ apps/desktop/src/store/zustand/listener/instance.ts:5 and __meeki_tabs_store__ apps/desktop/src/store/zustand/tabs/index.ts:77

**Impact:** Keys into import.meta.hot.data for HMR-stable store singletons in dev; nothing is persisted (the repo uses no zustand persist() middleware at all — verified by search). No action ever.

### localStorage keys: meeki-theme apps/desktop/src/shared/theme/apply.ts:5; meeki:cloudsync_initial_sync_completed: apps/desktop/src/auth/cloudsync-progress.ts:7; meeki:trial_{started

<details><summary>full anchor list</summary>

localStorage keys: meeki-theme apps/desktop/src/shared/theme/apply.ts:5; meeki:cloudsync_initial_sync_completed: apps/desktop/src/auth/cloudsync-progress.ts:7; meeki:trial_{started,ended,payment_reminder}_seen: apps/desktop/src/auth/billing.tsx:56-58; meeki.pending-welcome-session apps/desktop/src/onboarding/welcome-note.ts:9; meeki.template-picker.recent-emojis apps/desktop/src/templates/template-icon-picker.tsx:71

</details>

**Impact:** Each key is a single const whose reader and writer live in the same module; device-local WebView storage only. Renaming would only lose per-device UI state, and there are no user devices. No action.

### Tauri store / vault filenames: store.json plugins/store2/src/ext.rs:21, global.json crates/storage/src/global.rs:3, settings.json crates/storage/src/vault/path.rs:6

**Impact:** All deliberately brand-free; no meeki-named store file exists, so there is nothing in this group to rename or keep in sync. (The only branded on-disk name is the data-dir folder "meeki"/bundle-id dirs covered by the bundle-id contract.)

### INERT class — npm scope @meeki/*: 69 package.json names, ~1,158 references repo-wide

**Impact:** Workspace-internal only: 66 packages are "private": true; the 3 that aren't (packages/api-client, packages/supabase, packages/utils) have no version field and no publish workflow exists in .github/workflows, so nothing can reach a registry. Never crosses a boundary; no action.

### INERT class — cargo dependency aliases meeki-*: 162 alias lines in root Cargo.toml (lines 31+), each renaming an unbranded workspace package (e.g. meeki-e2ee → crates/e2ee package 

<details><summary>full anchor list</summary>

INERT class — cargo dependency aliases meeki-*: 162 alias lines in root Cargo.toml (lines 31+), each renaming an unbranded workspace package (e.g. meeki-e2ee → crates/e2ee package "e2ee", Cargo.toml:98); only two genuinely meeki-named packages exist: meeki-http-utils (crates/http/Cargo.toml:2) and meeki-cli (apps/cli/Cargo.toml:2)

</details>

**Impact:** Compile-time names only; nothing is published to crates.io. meeki-cli's bin name "meeki" is the one place this class touches a boundary and it is covered by the embedded-CLI contract site above. No action.

### INERT class — Rust identifiers meeki_*: ~2,989 occurrences across crates/, plugins/, apps/ (crate paths like meeki_db_app::, meeki_cloudsync::, meeki_e2ee::)

**Impact:** All are alias-derived module paths that never leave the binary — with the single exception of the envy env-struct fields reported separately as EXTERNAL-TO-CREATE (MEEKI_CLOUDSYNC_*, MEEKI_ATTACHMENT_BACKUP_GC_ENABLED). Also verified: snapshot filename meeki_cli__mcp__tests__mcp_contract.snap is test-internal. No action.

### INERT class — CSS keyframes: 1 name, meeki-dancing-stick, defined twice (apps/web/src/styles.css:26,62 and packages/ui/src/styles/globals.css:8,153) and consumed via the animate-me

<details><summary>full anchor list</summary>

INERT class — CSS keyframes: 1 name, meeki-dancing-stick, defined twice (apps/web/src/styles.css:26,62 and packages/ui/src/styles/globals.css:8,153) and consumed via the animate-meeki-dancing-stick utility in packages/ui/src/components/ui/dancing-sticks.tsx

</details>

**Impact:** Pure presentation; the two stylesheet copies must merely stay equivalent for visual consistency between web and desktop. Never crosses a boundary; no action.

### Inert test-fixture/comment references (no action ever): plugins/windows/src/events.rs:7 (commit-link comment); crates/aec/src/onnx/mod.rs:503-507 (test fixture named hyprnote); cra

<details><summary>full anchor list</summary>

Inert test-fixture/comment references (no action ever): plugins/windows/src/events.rs:7 (commit-link comment); crates/aec/src/onnx/mod.rs:503-507 (test fixture named hyprnote); crates/calendar/src/lib.rs:261-262 (hyprnote.zoom.us test fixture URL); crates/transcribe-whisper-local/src/lib.rs:18-20 and crates/gguf/src/lib.rs:161-170 (dev-machine-path tests, #[ignore]d or env-dependent); apps/desktop/src/session/resource-path.test.ts:11-12 (arbitrary /data/hyprnote path); plugins/store2/src/commands.rs:31 (comment); apps/web/src/lib/download.ts:2 (warning comment); scripts/info.sh, scripts/s3/*, scripts/download_releases.sh, scripts/package.json, scripts/pyproject.toml, e2e/cua/pyproject.toml (dev/ops scripts naming old infra — cosmetic)

</details>

**Impact:** None of these cross a boundary or ship to users; renaming is optional hygiene. The scripts/ entries do reference old infra (fastrepl/hyprnote CDN, hyprnote-cache buckets) but are operator conveniences, not build inputs.

**Action:** Optional cleanup; safe to batch with any nearby edit


## Auditor notes

### Beat: upstream-endpoints

Beat: every remaining reference to upstream-controlled infrastructure. Verified the two runtime model-download paths named in the brief: (1) Soniqo/Parakeet/Qwen STT weights download via HuggingFace Hub (crates/transcribe-soniqo/swift-lib/src/lib.swift:99 HuggingFaceDownloader) from repos under the `aufklarer` HF namespace — NOT an upstream private host, so not the critical case, but the namespace is not owner-controlled; (2) crates/am tar_url (model.rs:97-105) and the hypr-llm gguf (crates/local-model/src/lib.rs:61) are already neutralized to empty-by-default MEEKI_* build-time env vars — no phone-home remains. Whisper GGML and GGUF LLM downloads are all huggingface.co (ggerganov/unsloth/lmstudio-community) — public third party, fine. All Sentry DSNs and PostHog keys are env/secret-injected with only public SaaS hosts (us.i.posthog.com, sentry.io) hardcoded — no upstream DSN in the tree. Stable updater is disabled with empty endpoints (tauri.conf.stable.json:10-12, tauri.conf.json:85-88 active:false) — no desktop2.hyprnote.com anywhere. Deliberately-kept api.hyprnote.com strings are confined to unit tests (crates/owhisper-client/**, plugins/transcription tests, crates/listener*-core tests) per the owner's stated policy. Remaining INERT sites not listed individually: crates/buffer/src/lib.rs:323,399 (hyprnote.com/x test fixtures), crates/notification-macos/examples/test_notification_with_event.rs:32-42 (@hyprnote.com example emails), crates/detect/src/meeting_ax.rs:5278,5351 (fastrepl.webex.com fixtures), packages/editor test fixtures (fastrepl-inc Linear/Jira/Zoom URLs), plugins/windows/src/events.rs:127 (hyprnote:// deep-link test), crates/api-bot/src/config.rs:7 (doc comment), .github/reports/** (historical records with fastrepl Linear links), .github/workflows/eval_run.yaml:34 (~/.cache/hyprnote runner path), crates/detect/src/list/mod.rs:38-46 (old-brand self-app path segments — harmless defensive matching), crates/file/src/lib.rs:749,919 (HF test URLs). Third-party SaaS hosts that are correct as-is once the owner opens their own accounts (grouped under EXTERNAL-TO-CREATE below): Netlify, Supabase, Fly, Infisical, PostHog, Sentry, Honeycomb (apps/api/src/observability.rs:147), SQLite Cloud (env-driven; apps/api/src/main.rs:819 is test-only), Nango (api.nango.dev hardcoded only in apps/web/netlify/edge-functions/oauth-callback.ts:1 — generic SaaS callback), Mux (image.mux.com generic CDN; playback IDs come from the fresh DB), OpenStatus, CrabNebula webdriver for e2e (e2e/blackbox/wdio.blackbox.conf.ts:60-64 CN_API_KEY_WEBDRIVER).

### Beat: meeki-external

Beat: Meeki-named EXTERNAL contracts. Scope excludes .claude/worktrees/* (stale worktree copies). Key cross-cutting facts: (1) meeki.org has three independent consumers that each hard-bake the hostname — Netlify web build (netlify.toml), the Rust API (share-invite emails), and desktop release builds (VITE_APP_URL/VITE_API_URL in CI env) — so DNS + Netlify + Fly must all exist before any shipped binary's links work. (2) The updater is disabled in every tauri conf (tauri.conf.json:86 active:false, stable endpoints:[]), so there is currently NO updater-endpoint external contract; the CrabNebula pipeline (CN_APPLICATION fastrepl/hyprnote2) is the only release-distribution dependency and it is upstream's. (3) Under zero-users, every legacy alias (hyprnote/hypr/char schemes, hyprnote-* artifact names, com.meeki.Meeki's hyprnote binary) is renameable in one cut. One real cross-boundary mismatch found in passing: the Flatpak .desktop registers only x-scheme-handler/hypr while web emits meeki:// links.

### Beat: meeki-internal

Verification method: every group was checked by locating all producers and consumers, not by keyword counting. Summary: groups 1-7, 10 are coherent SELF-CONSISTENT contracts; group 8 has no persisted zustand state at all; group 9 contains no meeki-named filenames. The only substantive follow-ups found: (a) e2ee freeze tests miss 5 domain constants (4 in blob.rs, 1 inline in lib.rs:119) — cheap to add now, load-bearing forever; (b) the meeki-audio-tap literal is duplicated across two crates with no shared const; (c) x-meeki-device-name and x-device-fingerprint are absent from openapi.gen.json (doc-only gap); (d) share/open's scheme allowlist exists in two Rust locations. Out-of-beat observations passed along for other beats: the sidecar binary char-chrome-native-host (crates/chrome-native-host/Cargo.toml:7, crates/xtask/src/prepare_binaries.rs:36-40, .github/workflows/desktop_cd.yaml:110) is an old-brand name shipped inside the bundle and referenced by Chrome native-messaging manifests; eslint-plugin-hypr.mjs at repo root and the ANABLB01 blob magic (deliberately frozen, comment says brand-free) also carry pre-rebrand echoes. MCP resource URIs meeki://meetings/... (apps/cli/src/mcp.rs:175-208, docs/reference/mcp.mdx:41-43, snapshot .snap) are a self-consistent CLI-MCP contract frozen by the snapshot test — consistent on all sides, mentioned here since they reuse the meeki scheme string but are unrelated to the desktop deep-link registration.

### Beat: rename-candidates

Scope notes: (1) I analyzed only the main tree; .claude/worktrees/quirky-hertz-ea31ef is a stale duplicate of the repo and was excluded — remember it will re-match every grep until deleted. (2) The STT \"cloud\" model (isHyprnoteCloudSttModel, model==='cloud') is NOT dead: it is the hidden hosted-STT path that routes provider=hyprnote to the owner's own transcribe-proxy (qa-critical-ux SKILL.md:287 still tests it); rename it with the provider id rather than deleting. (3) Cross-beat items seen but left to other agents: CN_APPLICATION fastrepl/hyprnote2 and hyprnote-* artifact/S3 names in .github/workflows (desktop_publish.yaml:10, desktop_cd.yaml:26,188-288, sign_passthrough.yaml:23-40), apps/web/netlify.toml hyprnote.com 301 blocks, apps/web team/github-content @hyprnote.com emails (team page is user-visible), apps/web/src/routes/api/admin/content/{list,history}.ts and plugins/todo/read_path.rs repo=\"char\", crates/api-support/src/github.rs GITHUB_REPO=\"char\", crates/codex/config.rs NOTIFY_COMMAND [\"char\",...]. (4) Ordering advice for the atomic cuts: do the entitlement rename before first `supabase db push` and before creating the Stripe feature; do the STT-provider + proxy-domain rename before the first desktop release, since both ends of each wire live in this repo only until binaries ship.

