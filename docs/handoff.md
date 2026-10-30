# Handoff

Notes that carry a change in progress across a `/clear`, a compaction or a crash, dumped here without being sorted
into the right doc. It bends "one fact, one place", one phase at a time.

1. Read this file before anything else in a session. A hook prints its notes when a session starts, with the file of
   the phase they name; it reads that phase from the latest heading, so keep `phase <n>` in it.
2. Notes are stale when the phase they name has ended, or when the change they name has been committed (check
   `git log` since the commit they were written from; another commit in between does not make them stale). Wipe
   stale notes; when unsure, ask the owner first.
3. Before ending any reply where something worth keeping happened (an owner's decision, a finding, work that would
   be costly to redo), add it here; a hook asks once when a turn ends without it. Add lines; rewrite an earlier one
   only when it turned false.
4. A note keeps what a session could not rebuild from the code and docs: the owner's choices in their own words
   (quoted short, never made stronger), what was tried or ruled out and why, each finding with its verdict, the
   files and symbols it touched, and numbers that would cost a rerun (test counts, costs, review files). Never
   diffs, file contents or a step-by-step story. Detail beats brevity here: fold a line only when a later one
   supersedes it, and past about 100 lines a phase, fold its oldest settled ones.
5. The last line is `Now:` with where things stand and the next step, rewritten every time.
6. In plan mode this file cannot be written: the plan file holds the notes, and the first write after it carries
   the owner's choice and the plan here.
7. When a phase ends, replace the notes with that phase's outcome (the owner's choice in their words, the plan, the
   review's verdicts) under the next phase. The commit that ends merge prep leaves only this header.
8. Nothing here is the record: merge prep still puts each fact in its own doc.

Notes go below as `## <change>, phase <n> (<name>), from <short HEAD>`, then short lines.
