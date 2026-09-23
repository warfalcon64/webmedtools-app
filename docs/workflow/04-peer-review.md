# 4. Peer review

**Purpose.** Have the change read by a model that does not share the author's blind spots.

**Minimum form.** Still run it. A small diff costs cents and takes a minute.

**Steps**
1. Run the peer-review script on the uncommitted diff, with a model from a different family than the author's
   (command and defaults in project.md). Use a stronger model for a change that touches money, data or the turn path.
2. While it runs, review the diff yourself. Your own reading is the primary review; the outside model is a second
   pair of eyes, not an authority.
3. Check **every** finding against the actual code before acting on it. Outside models hallucinate call sites,
   invent rules and misread control flow.
4. Give each finding a verdict: confirmed (with what it would break) or rejected (with a one-line reason).
5. Ignore style, naming and preference notes entirely. They are noise, and acting on them makes the diff worse.

**Exit.** The verdict list. Confirmed findings become work in the next phase; rejected ones are named and dropped.

**Who.** An outside model reviews; the lead verifies and decides. The owner sees the verdict list if anything is
contentious.
