# Workflow

Six phases on every change, however small: brainstorm, plan, implement, peer review, harden, merge prep. Read the
phase file when you enter that phase, not before. Each phase has a minimum form, so a one-line fix walks all six in
a couple of minutes.

| Phase | File | Ends with |
|---|---|---|
| 1. Brainstorm | [01-brainstorm.md](01-brainstorm.md) | the owner's choice, or "no open design question" |
| 2. Plan | [02-plan.md](02-plan.md) | a plan of ten lines or fewer |
| 3. Implement | [03-implement.md](03-implement.md) | a diff the lead has read, tests green |
| 4. Peer review | [04-peer-review.md](04-peer-review.md) | a verdict per outside finding |
| 5. Harden | [05-harden.md](05-harden.md) | what was checked for real, and what was not |
| 6. Merge prep | [06-merge-prep.md](06-merge-prep.md) | the ready-to-commit summary |

Project-specific commands, checks and paths live in [project.md](project.md). The owner steers: work stops for them
at the choice (1), the go (2) and the commit (6).
