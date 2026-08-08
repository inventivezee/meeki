# Overview

Tauri desktop note-taking app (`apps/desktop/`) with a marketing site
(`apps/web/`). Uses pnpm workspaces.

`apps/web` is the site that serves meeki.ai: Next.js 16 App Router built by
`vinext` and deployed to a Cloudflare Worker. It is a marketing site only — `/`,
`/personal` and a `/r/[code]` referral redirect. It is **not** the TanStack Start
app that used to live at this path; that tree was never deployed and was removed
in `852ee6c`. Do not reach for TanStack Router, Netlify or `src/routes/`
conventions here.
SQLite is the primary data store (schema and migrations in `crates/db-app/`, desktop transport in `plugins/db/`), Zustand is used for UI state, and TipTap powers the editor. Sessions are the core entity — all notes are backed by sessions.

## Commands

- Format: `pnpm exec dprint fmt`
- Typecheck (TS): `pnpm -r typecheck`
- Typecheck (Rust): `cargo check`
- Desktop dev: `pnpm -F @meeki/desktop tauri:dev`
- Web dev: `pnpm -F web dev`
- Web verify: `pnpm -F web typecheck && pnpm -F web test`
- Dev docs: `docs/` in this repo (the `docs.meeki.ai` host has no DNS record)

## Guidelines

- Format via dprint after making changes.
- JavaScript/TypeScript formatting runs through `oxfmt` via dprint's exec plugin.
- Run `pnpm -r typecheck` after TypeScript changes, `cargo check` after Rust changes.
- After editing files, run the relevant verification commands before finishing.
- For `apps/desktop/` TypeScript changes, prefer `pnpm -F desktop typecheck` to match CI.
- After edits, run `pnpm exec dprint fmt`.
- Use `useForm` (tanstack-form) and `useQuery`/`useMutation` (tanstack-query) for form/mutation state. Avoid manual state management (e.g. `setError`). This applies to `apps/desktop`; `apps/web` has neither dependency and should stay dependency-light.
- In `apps/web`, keep absolute URLs derived from `SITE_ORIGIN` in `app/site.ts`. Never rebuild an origin from request headers — `www` and the apex both answer, so that produced two competing canonicals.
- `apps/web` runs on Cloudflare Workers: no filesystem and no `new Function()`/`eval` at runtime. Content must be inlined at build time (`import.meta.glob`, `?raw`).
- Verify `apps/web` against the Workers runtime, not `vinext start`. The Node server rewrites `Content-Type` from the URL extension and reports `.txt` as `application/octet-stream`. Use `pnpm exec wrangler dev --config dist/server/wrangler.json` after a build.
- For `plugins/db` live queries, keep schema creation, migrations, and DB initialization on the Rust side; TypeScript should only consume `execute`/`subscribe` APIs.
- Branch naming: `fix/`, `chore/`, `refactor/` prefixes.

## Code Style

- Avoid creating types/interfaces unless shared. Inline function props.
- Do not write comments unless code is non-obvious. Comments should explain "why", not "what".
- Use `cn` from `@meeki/utils` for conditional classNames. Always pass an array, split by logical grouping.
- Use `motion/react` instead of `framer-motion`.

## CLI TUI Command Architecture

Choose the lightest command structure that fits the workflow.

Use the full reducer/effect/runtime split only when the command has async orchestration, a multi-step workflow, or substantial state transitions that benefit from reducer-style tests.

```
commands/<name>/
  mod.rs        -- Screen impl, Args, run()          [glue]
  app.rs        -- App or screen-local state          [optional]
  action.rs     -- Action enum                        [optional]
  effect.rs     -- Effect enum                        [optional]
  runtime.rs    -- Runtime, RuntimeEvent              [async I/O]
  ui.rs         -- draw(frame, app)                   [rendering]
```

Naming rules:

- Types drop the command prefix: `App`, `Action`, `Effect`, `Runtime`, `RuntimeEvent`
- `app.rs` → `app/mod.rs` with private submodules when state is complex
- `ui.rs` → `ui/mod.rs` with sub-files when rendering is complex
- `action.rs`/`effect.rs` are siblings of `mod.rs` when they exist; do not create them by default for simple list/detail screens
- `app.rs` contains no rendering logic, no API calls, no async code when using the reducer pattern
- Prefer `screen.rs` plus a small local state struct for simple browse/select flows
- Do not add parent-level action/effect translation layers that proxy child workflows through another command's reducer

## Misc

- Do not create summary docs or example code files unless requested.
