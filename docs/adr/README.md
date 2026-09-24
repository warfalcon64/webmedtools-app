# Architecture decision records

Why this project is built the way it is, so a later session does not quietly undo it. One decision per file, Nygard
shape: context, decision, consequences. The bar is simple: a later session could plausibly undo this and nothing in
the code would tell them not to. Prefer extending a related record to adding a file; past ~40 records, merge or prune.

This library holds **live** decisions only. Edit a record in place when it is refined or its file pointers move; when a
decision is reversed, rewrite that record under its own number with the old approach folded into Context (that sentence
is what stops the old idea coming back); when it stops applying at all, delete the file and its row. Git keeps history.
Read the row you need here before changing a subsystem, and open the file only if the row is not enough.

| # | Decision | Gist |
|---|---|---|
| 0001 | [The legacy Java app is reference only, and goes when the MVP ships](0001-legacy-app-is-reference-only.md) | `Webmedtools/` is git-ignored and read-only; nothing depends on it, and it is deleted after the MVP. |
| 0002 | [Worksheet rules follow the legacy generator, with the published sheets' short gaps](0002-worksheet-rules.md) | a to z in order, one target per word, 0 to 4 fillers never holding the next target; change one only via brainstorm. |
| 0003 | [The lead session implements; there is no implementing subagent](0003-the-lead-session-implements.md) | Opus 5.5 plans, edits and reviews itself; phase 3's implementing agent does not apply. |
| 0004 | [Next.js with static export; no server until a tool needs one](0004-next-js-static-export.md) | Pre-built HTML for search and ads, served as Cloudflare Workers static assets; no server features until a brainstorm lifts `output: "export"`. |
| 0005 | [Worksheets print from the browser; the preview is the printed page](0005-worksheets-print-from-the-browser.md) | No PDF library: measured sheets are shown and printed as they are; Save as PDF comes from the print dialog. |
| 0006 | [The site's look: rounded blues in Atkinson Hyperlegible, light and dark](0006-site-look-and-themes.md) | Colour role tokens with dark values; theme set before paint; panels glow, never outlined; the sheet keeps its look. |
