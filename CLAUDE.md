# WebMedTools — notes for Claude Code

A site of rehabilitation tools, starting with printable concussion-rehabilitation worksheets that hide the letters a
to z in random words (spec §0). Next.js 16 with static export, TypeScript, Tailwind 4; no server (ADR 0004).

## Commands
- `npm run dev`, `npm test` (Vitest, then the peer-review script's `node --test`), `npm run typecheck`,
  `npm run build` (static site in `out/`). Node 22.12 or later.
- Peer review: `node --env-file=.env scripts/peer-review.mjs`. It costs money: the first run was $0.26 for 16k tokens
  in. Flags are in `docs/workflow/project.md`.
- How to check the running app without a person is in `docs/workflow/project.md` (Real checks).

## Rules
- Nothing that needs a server: no server actions, request-reading route handlers, redirects or headers, and no
  default `next/image` loader. Lifting `output: "export"` is a brainstorm (ADR 0004).
- Never edit, build into or depend on `Webmedtools/`; read it for behaviour only (ADR 0001).
- The worksheet rules are the legacy generator's; changing one is a brainstorm question, not a fix (ADR 0002).
- The lead implements directly, with no implementing subagent (ADR 0003).

## Docs
- `docs/architecture.md` — the shape of the app and which file to open. Read before working in an unfamiliar
  area; update it when structure moves.
- `docs/adr/README.md` — index of architecture decision records, one row each. Read the row before changing a
  subsystem it covers; open the file when the row is not enough.
- `docs/spec.md` — the design for what is **not** built yet, plus a one-note record of what is. Built work
  collapses to a `**Built.**` note there; the reasoning goes to an ADR, never back into the spec.
- `docs/workflow/` — the six phases every change walks, one file each. See below.
- `docs/glossary.md` is not written yet; it starts with the generator port, which brings the first coined terms.
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
- The owner lists the known issues with the app; the eye test generator is then ported with them in mind.
- Hosting on Cloudflare Pages, when the owner sets up the account: build `npm run build`, output `out/`, Node 22.12+.
- Add a source for the guidelines and rewrite ADR 0002 against it.
