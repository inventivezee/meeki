# Archived content — not published

Nothing in this directory is served. There is no `/blog`, `/privacy`, or
`/terms` route. The files are kept here so that publishing any of them later is
a matter of adding a route, not of recovering content.

They were rescued from the TanStack Start tree that used to occupy `apps/web`,
removed in `852ee6c`. That tree was never deployed — `meeki.org` has no DNS
record and every route it defined returns 404 on meeki.ai.

## articles/ — 62 MDX files

**Read this before publishing any of them.**

- **61 of the 62 are still live on someone else's domain.** Verified by request:
  `char.com/blog/<slug>` returns 200 for all but one, and `hyprnote.com` mirrors
  the same set. Publishing them here would make meeki.ai the third and
  newest-and-least-authoritative copy of the same text. The realistic outcome is
  that search engines canonicalise to char.com and filter these out — no traffic
  gained, and some risk of the site being read as scraped.
- **`author` is `John Jeong` on 60 of them** — the upstream project's author, not
  this project's. The code is MIT; the prose is a separate question.
- **`char-is-now-meeki.mdx` is the exception** and is safe to publish: it 404s on
  both upstream domains, it is the rebrand announcement written for this
  project, and it contains no images. One caveat — it asserts that
  "char.com/blog/\* redirects here", which is not true today; those URLs return
  200 with the original content. Fix that line before publishing.
- **All 273 in-body images are gone.** They resolved through an `/api/assets/*`
  proxy to upstream's Supabase bucket, which now answers `NoSuchKey`;
  hyprnote.com 502s and char.com 404s. The bytes are not in this repository and
  are not recoverable from it. 19 of the 62 articles reference no images at all.
- `<CtaCard>` appears 27 times and rendered nothing in the old tree, so its
  copy has never been seen. `<Image>` accounts for the other 97 JSX uses. Those
  two are the only custom components the corpus needs.
- Three files carry `ready_for_review: true` and five carry `featured: true`.
  Nothing ever filtered on either.
- `obsidian-meeting-notes.mdx` still has a literal `{{date:YYYY-MM-DD}}`
  placeholder in its `date` field, and a body-level `<h1>` that would duplicate
  the route heading.

If a blog is wanted later, the mechanism is settled: register
`@mdx-js/rollup` in `vite.config.ts` **before** `vinext()`, with
`remark-frontmatter` and `remark-mdx-frontmatter`, and pull files in with
`import.meta.glob`. Do **not** reach for `content-collections` — it renders via
`new Function()`, which Cloudflare Workers blocks at runtime. vinext also sets no
`providerImportSource`, so the Next `mdx-components.tsx` convention is silently
inert; pass the component map explicitly.

## legal/ — privacy.mdx, terms.mdx

Pure markdown, no custom components. Both name **`Fastrepl, Inc.`** as the
operating entity — five occurrences across the two files, one of them
(`terms.mdx`, the limitation-of-liability clause) in all caps as `FASTREPL, INC.`,
so search case-insensitively. Which entity operates the service is a legal fact,
not a find-and-replace: it needs a decision from whoever owns the company before
either document is published.

## A note on this directory

`plugins/deeplink2` and `plugins/hooks` write generated descriptors into
`apps/web/content/{deeplinks,hooks}` from Rust `#[test]` functions. Those
directories will reappear here on the next `cargo test` and are not web content.
To stop that, change the output paths in those two crates rather than deleting
the files.
