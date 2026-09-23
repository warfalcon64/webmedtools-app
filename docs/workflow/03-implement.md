# 3. Implement

**Purpose.** Write the change, with the tests, and nothing else.

**Minimum form.** The lead edits directly and runs the checks. Do not spawn an agent for a one-line fix.

**Steps**
1. One implementing agent for the change. Continue that same agent for follow-ups rather than starting a fresh one:
   it already holds the context, and a new one re-reads everything. The exception is a full head: check the token
   count each time it reports, and once it passes about 30% of its window, retire it and brief a fresh one with a
   handoff (what exists, which files, the constraints, the task).
2. Match the surrounding code — its style, its comment density, its naming. A diff should not announce its author.
3. Add the tests from the plan in the file and style the project already uses.
4. Run the project's typecheck and test suite; both pass before the phase ends (see project.md).
5. Do not commit. Do not widen the change: anything discovered along the way goes to the owner as a note, not into
   the diff.
6. Report terse: what changed, what the numbers are, what was left undone.

**Exit.** A working tree the lead has reviewed as a **diff**, with the suite green. Read the diff, never just the
report — the report is the author's account of the work, not the work.

**Who.** One implementing subagent writes; the lead reviews. The owner is not involved yet.
