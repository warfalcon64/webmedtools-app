# 5. Harden

**Purpose.** Make the change survive the real world, not just the happy path.

**Minimum form.** Reread the diff for the failure path and rerun the suite.

**Steps**
1. Fix the confirmed findings from the review.
2. Walk the failure paths: what happens when the call fails, times out, returns nothing, or returns junk. Every
   external result is untrusted input.
3. Feed it empty, old and malformed input. Anything read from disk must still load after the change: old saves are
   real users' data, and a schema that gained a field needs a default.
4. When the change touches something tests cannot see, check it for real once: a model-facing prompt or turn path
   needs a real run, UI needs a screenshot (see project.md).
5. Rerun the whole suite and the typecheck, not just the file you touched.

**Exit.** A plain statement of what was checked for real and what was not. "Not verified in the app" is a valid
ending; pretending otherwise is not.

**Who.** The lead, or the same implementing agent continued with the confirmed findings.
