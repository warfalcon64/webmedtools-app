# 4. Peer review

**Purpose.** Have the change read by a model that does not share the author's blind spots.

**Minimum form.** Still run it. A small diff costs cents and takes a minute.

**Steps**
1. Run the peer-review script on the uncommitted diff, with a model from a different family than the author's
   (the command is in project.md; its `--help` lists the flags and defaults). Pass `--focus` with what the change is
   and where to look: a focused run finds what an unfocused one misses. Use a stronger model for a change that
   touches money, data or the core path.
2. While it runs, review the diff yourself. Your own reading is the primary review; the outside model is a second
   pair of eyes, not an authority.
3. When it fails or warns: exit 2 means the owner must act (a key, credits, a refusal), so stop and tell them, and
   never skip the review. A run it warns about reasoning is no review. One that gave up after its retries, or says it
   got no review, is run again; if that happens again, tell the owner.
4. Check **every** finding against the actual code before acting on it. Outside models hallucinate call sites,
   invent rules and misread control flow.
5. Give each finding a verdict: confirmed (with what it would break) or rejected (with a one-line reason).
6. Ignore style, naming and preference notes entirely. They are noise, and acting on them makes the diff worse.

**Exit.** The verdict list. Confirmed findings become work in the next phase; rejected ones are named and dropped.

**Who.** An outside model reviews; the lead verifies and decides. The owner sees the verdict list if anything is
contentious.
