# WebMedTools spec

This doc is the design for what is **not built yet**. A section that ships collapses to a short `**Built.**` note
naming what shipped, its entry point, and any way the build deviates; the reasoning behind it goes to `docs/adr/`,
never back into this file. Section numbers are referenced from code and ADRs, so they are never renumbered or removed.

The site shell is built (home page and tools menu, `app/`), and so are the eye test tool (§1) and the UI overhaul
(§2). §3 to §5 are the roadmap, in order; each is an open design, settled at its own brainstorm.
Parked until the owner promotes one: vision printables (Hart charts, number-naming cards), on-device symptom and
return-to-play logs, printable home exercise programmes; and asking the doctors what they still do by hand.

## 0. Why
Patients in concussion rehabilitation practise their eye movements on printed worksheets: a block of random words
that hides the letters a to z, in order, for the patient to find. The app generates a fresh worksheet on demand,
following the Michigan saccades eye test guidelines (ADR 0002). It is the renewal of a 2023 Java app (ADR 0001), and
the first of several tools the site is meant to hold. The site is free and ad-supported, found through search and
word of mouth. It serves patients and clinicians both while adoption is informal, and may turn to clinicians later.
Two practising doctors the owner knows (internal and family medicine) check each tool before it ships, within their
field.

## 1. Eye test worksheets
**Built.** `/eye-test` (`app/eye-test/`, generator in `lib/eye-test/`): 1 to 100 exercises on Letter or A4, each with
an a to z row, its number and a timing blank, previewed as the printed sheets (ADR 0005). Rules are in ADR 0002.

## 2. UI overhaul
**Built.** Rounded blue look in Atkinson Hyperlegible Next, light and dark with a header toggle (ADR 0006); home page
of built tools grouped by kind; footer disclaimer; restyled eye test controls. The printed sheet is unchanged. The
About page moved to §5.

## 3. First cognitive worksheet
A second printable, for attention and scanning practice. Leading candidate: letter cancellation, a grid of random
letters in which the patient crosses out every target, timed. Later ones: trail-making (1-2-3, 1-A-2-B), star
cancellation, Stroop cards (colour printing), symbol-digit substitution. Our own random versions of published
tests, offered as practice, not assessment. It should share the eye test's measure, paginate and print path (ADR
0005) rather than copy it. Open: which worksheet, and what the doctors say.

## 4. First on-screen exercise
An exercise done on the screen, not on paper. Candidates: a smooth-pursuit dot (direction and speed set by the user),
a saccade trainer (a dot jumping between two points on a beat), a gaze-stabilisation (VOR) metronome. Known limits: no
flashing, a full-screen mode, and a note to stop if symptoms worsen. Open: which one first.

## 5. Domain and AdSense
The owner's domain is moving from Hostinger to Porkbun. For the Worker to serve it, its nameservers must point to
Cloudflare. AdSense also needs Privacy and About pages (About was left out of §2), `ads.txt`, and Google's consent
message for EEA and UK visitors. The owner wants Auto ads, which must never land in a printed sheet or crowd an
on-screen exercise. Apply once §3 has shipped: AdSense turns down sites with little content. Open: what happens to the
workers.dev address, and how Auto ads are kept out of the tools.
