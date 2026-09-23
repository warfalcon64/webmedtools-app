# 0002. Worksheet rules follow the legacy generator until a guideline source is added

Date: 2026-09-22

## Context
Worksheets follow the Michigan saccades eye test guidelines, but no written source is in the repo. The owner treats
the legacy generator as having implemented the high-level rules correctly.

## Decision
The rules are those of `Generator.generate`, `WordMaker` and `WordArranger` in
`Webmedtools/webmedtools-app/app/src/main/java/com/webmedtools/application/backend/`. The letters a to z each appear
once as a target, in order. Each target sits in a word that holds it exactly once. The filler words between two
targets never contain the next target letter. Word, gap, sentence and line lengths are legacy values, not confirmed
guideline values.

## Consequences
A rule that looks wrong goes to the owner as a brainstorm question, not a quiet fix. When a source is added, this
record is rewritten against it.
