# 2. Plan

**Purpose.** Know what will be touched, how it will be proven, and what could break, before writing anything.

**Minimum form.** Two lines: the file and the check. A one-line fix does not need a brief.

**Steps**
1. List the files to touch, entry points first. Read them, and read the decision records that cover them.
2. Say what tests will be added or changed, and what they actually prove.
3. Say how it will be verified for real when tests cannot see it — a prompt sent to a model, a UI, or output only a
   person can judge needs a real check, not a green suite (see project.md).
4. Name the risks to saved data: migrations, old files that must still load, anything written to disk.
5. Write the brief for the implementer: the constraints they must not break, the checks to run, what not to touch,
   and a word cap on their report. Tight briefs produce tight diffs.

**Exit.** The plan, shown to the owner. A feature waits for a go; a one-line fix proceeds. In plan mode the plan goes
in the plan file, as long as the change needs, and `ExitPlanMode` shows it: the owner's approval there is the go, so
do not also ask whether to proceed. Outside plan mode the plan is written in chat, ten lines or fewer.

**Who.** The lead session plans and writes the brief. The owner gives the go.

The owner steers: a feature does not start without their go.
