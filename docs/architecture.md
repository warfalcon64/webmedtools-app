# Architecture

The shape of the app, not its contents: the code is the source of truth, and this page is here so you know which file
to open. Why things are this way lives in `docs/adr/`; terms are defined in `docs/glossary.md`.

## Processes and layers

| Layer | Path | May import |
|---|---|---|
| pages (Next.js App Router, React, Tailwind) | `app/` | npm packages, `app/`, `lib/` |
| tool logic, plain TypeScript with no React | `lib/` | npm packages, `lib/` |

There is no server: `next build` pre-renders every page to `out/`, which Cloudflare Workers serves as static assets
(ADR 0004). Everything a tool computes runs in the browser.

## The site shell
- `app/tools.ts` — the one list of built tools, each with its group and icon; the header menu and the home page both
  read it.
- `app/layout.tsx` — page metadata, the font, the theme script, the header menu (`NavLink.tsx`) and the footer.
- `app/page.tsx` — the home page, tools grouped by kind. `app/icons.tsx` — the line icons and the site's mark.
- `app/globals.css` — the colour tokens and their dark values (ADR 0006). `app/theme.ts` — the script that sets the
  theme before the page draws, tested in `theme.test.ts`; `app/ThemeToggle.tsx` — the header's light/dark button.

## The eye test tool
- `app/eye-test/page.tsx` — the page and its instructions, pre-built as HTML.
- `app/eye-test/Worksheet.tsx` — the controls, the off-screen measuring, and the sheets that are both preview and
  print (ADR 0005).
- `lib/eye-test/generate.ts` — one exercise, by the rules in ADR 0002. `lib/eye-test/paginate.ts` — packs measured
  exercises onto sheets. Each has a Vitest file beside it.

## Where things live
- `next.config.ts` (static export), `vitest.config.mts` (keeps Vitest out of `scripts/` and `Webmedtools/`).
- `wrangler.jsonc` (the Cloudflare Worker that serves `out/`), `.node-version` (the build's Node).
- `scripts/peer-review.mjs` — the peer-review tool, copied from the doc-system kit; not part of the site.
- `AGENTS.md` — Next's own note for coding agents, rewritten by `next dev`.
- `Webmedtools/` — the legacy Java app, reference only (ADR 0001).
