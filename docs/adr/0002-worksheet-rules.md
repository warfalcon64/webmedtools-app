# 0002. Worksheet rules follow the legacy generator, with the published sheets' short gaps

Date: 2026-09-23

## Context
No source gives rules for generating these worksheets; the published ones are fixed sheets. The Michigan Tracking
handout (Studt Center, SCCO, in Scheiman & Rouse, 2006) and Ann Arbor Letter Tracking have about 65 words per
exercise, 0 to 5 fillers between targets, and a target on every line. The legacy generator's 7 to 12 fillers made
exercises of 200 to 330 words, too long to print legibly, and its line breaks only suited that length.

## Decision
`lib/eye-test/generate.ts`: a to z in order, one target per word, holding its letter exactly once; 0 to 4 fillers
between targets, never holding the next one, so every printed line has a target. Words are 3 to 5 random letters,
in sentences of 15 to 20 words; the text wraps freely. The owner kept the legacy's random letters and sentence length
over the sources' pronounceable words and short sentences.

## Consequences
A rule that looks wrong goes to the owner as a brainstorm question, not a quiet fix.
