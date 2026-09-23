# 6. Merge prep

**Purpose.** Leave the repo honest: docs that match the code, and a commit the owner can read.

**Minimum form.** One line: "no decisions, no doc changes", plus the commit message.

**Steps**
1. State which decision records the work adds, rewrites or leaves alone — often none — and write them now, in the
   same change (see project.md for the path and format).
2. Update the structural docs that the change made stale: the architecture map, the glossary when you coined a term,
   the spec note when something planned got built.
3. Delete what stopped being true. Git keeps the history; a stale line in a doc costs every future session.
4. Write the commit message in the repo's own style: read the last ten with `git log`.
5. Say what the change does not cover, so the owner is not surprised later.

**Exit.** A ready-to-commit summary: the diff, the docs touched, the decision records, the message.

**Who.** The lead prepares. The owner decides.

The owner steers: nothing is committed until they say so.
