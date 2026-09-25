# Project specifics for the workflow

Everything the phase files defer to, for this repo. This is the only workflow file that names a path or a command,
so it is the only one to rewrite when the kit is copied.

- **Decision records.** `docs/adr/`, index at `docs/adr/README.md`. Read the index row before changing a subsystem it
  covers. Format and the bar for a new one are in that README.
- **Structural docs.** `CLAUDE.md` (rules and commands), `docs/architecture.md` (the map), `docs/spec.md` (design for
  what is not built; built work collapses to a `**Built.**` note), `docs/glossary.md` (coined terms).
- **Implement.** The lead edits directly (ADR 0003): step 1 of `03-implement.md` does not apply, every other step
  does.
- **Checks.** `npm run typecheck` and `npm test` must pass before implementation ends.
- **Peer review.** `node --env-file=.env scripts/peer-review.mjs` reviews the working tree (everything, before a
  first commit); `--base main` reviews a branch, `--model <id>` picks a stronger reviewer, `--dry-run` prints the
  file list and token estimate without calling the API, and `--max-tokens <n>` refuses a pack bigger than that. Pass
  `--focus "<what the change is and where to look>"`. The key is `OPENROUTER_API_KEY` in `.env` (git-ignored), and
  `--env-file` is what loads it.
- **Real checks.** A page change: `npm run build`, then check that `out/<page>.html` already holds the page's text,
  since pre-built HTML is the point of ADR 0004. For the rest, serve the build (`npx wrangler dev --port 8788`):
  `npm run shots` screenshots every page in both themes at desktop and phone width into `.checks/shots/`, and
  `--css <file> --name <label>` tries a look without touching the code. Print changes: `npm run print-check` prints
  the eye test in Chrome and Firefox, both themes, Letter and A4, and fails unless every PDF matches its preview
  sheet for sheet and line for line. Safari cannot print under automation, so the owner checks it through the print
  dialog. Worksheets are read against the rules in ADR 0002.
  Hosting changes: `npx wrangler deploy --dry-run`, then `npx wrangler dev` serves `out/` as Cloudflare does.
- **Commits.** The owner commits. Never commit without being asked. A push to `main` deploys the live site; push only
  when asked.
