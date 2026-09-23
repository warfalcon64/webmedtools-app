# WebMedTools — notes for Claude Code

A site of rehabilitation tools, starting with printable concussion-rehabilitation worksheets that hide the letters a
to z in random words (spec §0). Next.js 16 with static export, TypeScript, Tailwind 4; no server (ADR 0004).

## Commands
- `npm run dev`, `npm test` (Vitest, then the peer-review script's `node --test`), `npm run typecheck`,
  `npm run build` (static site in `out/`). Node 22.12 or later.
- Hosting: Cloudflare Workers serves `out/` (`wrangler.jsonc`) at https://webmedtools-app.amritmenon108.workers.dev;
  every push to `main` deploys (ADR 0004).
- Peer review: `node --env-file=.env scripts/peer-review.mjs`. It costs money: the first run was $0.26 for 16k tokens
  in. Flags are in `docs/workflow/project.md`.
- How to check the running app without a person is in `docs/workflow/project.md` (Real checks).

## Rules
- Nothing that needs a server: no server actions, request-reading route handlers, redirects or headers, and no
  default `next/image` loader. Lifting `output: "export"` is a brainstorm (ADR 0004).
- Never edit, build into or depend on `Webmedtools/`; read it for behaviour only (ADR 0001).
- The worksheet rules are in ADR 0002; changing one is a brainstorm question, not a fix.
- The worksheet preview is the printed page: change one, check the other (ADR 0005).
- The lead implements directly, with no implementing subagent (ADR 0003).

## Docs
- `docs/architecture.md` — the shape of the app and which file to open. Read before working in an unfamiliar
  area; update it when structure moves.
- `docs/adr/README.md` — index of architecture decision records, one row each. Read the row before changing a
  subsystem it covers; open the file when the row is not enough.
- `docs/spec.md` — the design for what is **not** built yet, plus a one-note record of what is. Built work
  collapses to a `**Built.**` note there; the reasoning goes to an ADR, never back into the spec.
- `docs/workflow/` — the six phases every change walks, one file each. See below.
- `docs/glossary.md` — the terms coined here (exercise, target, filler, sheet).
- `AGENTS.md` is Next's own note, rewritten by `next dev`; leave it alone. Next 16 is newer than most training data,
  so check an API in `node_modules/next/dist/docs/` (this exact version) before using it.

## Workflow
Every change walks six phases, however small: brainstorm, plan, implement, peer review, harden, merge prep. Each has a
minimum form, so a one-line fix takes minutes. Read `docs/workflow/0N-*.md` when you enter that phase, not before,
and `docs/workflow/project.md` for the commands and paths they defer to.
- Peer review sends the uncommitted diff to an outside model from another family, and every finding is checked
  against the code before it is acted on.
- The owner steers; work stops for them three times: the design choice (1), the go-ahead (2), the commit (6).
- Merge prep is where the docs get honest: name the ADRs the work adds, rewrites or leaves alone and write them in the
  same commit, update what the change made stale, delete what stopped being true.

## Next up
- Deferred by the owner: check worksheet printing in Safari and Firefox; only Chrome is verified (ADR 0005).
