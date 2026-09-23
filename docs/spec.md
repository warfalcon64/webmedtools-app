# WebMedTools spec

This doc is the design for what is **not built yet**. A section that ships collapses to a short `**Built.**` note
naming what shipped, its entry point, and any way the build deviates; the reasoning behind it goes to `docs/adr/`,
never back into this file. Section numbers are referenced from code and ADRs, so they are never renumbered or removed.

The site shell is built (home page and tools menu, `app/`), and so is the eye test tool (§1); nothing is designed
ahead yet, and the next section starts at the next brainstorm.

## 0. Why
Patients in concussion rehabilitation practise their eye movements on printed worksheets: a block of random words
that hides the letters a to z, in order, for the patient to find. The app generates a fresh worksheet on demand,
following the Michigan saccades eye test guidelines (ADR 0002). It is the renewal of a 2023 Java app (ADR 0001), and
the first of several tools the site is meant to hold. The site is free and ad-supported, found through search and
word of mouth; whether it serves patients, clinicians or both is not decided.

## 1. Eye test worksheets
**Built.** `/eye-test` (`app/eye-test/`, generator in `lib/eye-test/`): 1 to 100 exercises on Letter or A4, each with
an a to z row, its number and a timing blank, previewed as the printed sheets (ADR 0005). Rules are in ADR 0002.
