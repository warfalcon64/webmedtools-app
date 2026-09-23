# Architecture

The shape of the app, not its contents: the code is the source of truth, and this page is here so you know which file
to open. Why things are this way lives in `docs/adr/`; terms are defined in `docs/glossary.md`.

## Processes and layers

| Layer | Path | May import |
|---|---|---|
| pages (Next.js App Router, React, Tailwind) | `app/` | npm packages, `app/`, `lib/` |
| tool logic, plain TypeScript with no React | `lib/` | npm packages, `lib/` |

There is no server: `next build` pre-renders every page to `out/` (ADR 0004). Everything a tool computes runs in the
browser.

## The site shell
- `app/tools.ts` — the one list of tools; the header menu and the home page both read it. A tool without an `href`
  shows as "Coming soon" and is not linked.
- `app/layout.tsx` — page metadata and the shared header menu.
- `app/page.tsx` — the home page.

## The eye test tool
- `app/eye-test/page.tsx` — the page and its instructions, pre-built as HTML.
- `app/eye-test/Worksheet.tsx` — the controls, the off-screen measuring, and the sheets that are both preview and
  print (ADR 0005).
- `lib/eye-test/generate.ts` — one exercise, by the rules in ADR 0002. `lib/eye-test/paginate.ts` — packs measured
  exercises onto sheets. Each has a Vitest file beside it.

## Where things live
- `next.config.ts` (static export), `vitest.config.mts` (keeps Vitest out of `scripts/` and `Webmedtools/`).
- `scripts/peer-review.mjs` — the peer-review tool, copied from the doc-system kit; not part of the site.
- `AGENTS.md` — Next's own note for coding agents, rewritten by `next dev`.
- `Webmedtools/` — the legacy Java app, reference only (ADR 0001).
