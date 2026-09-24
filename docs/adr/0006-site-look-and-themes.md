# 0006. The site's look: rounded blues in Atkinson Hyperlegible, light and dark

Date: 2026-09-24

## Context
The MVP looked unfinished (spec §2). Three rendered directions were shown: calm clinical, warm and friendly, high
legibility. The owner took the warm one's rounded shapes, in blue, with the legibility one's typeface, plus dark mode:
light sensitivity is common after concussion.

## Decision
Colours are roles in `app/globals.css` (`bg-canvas`, `text-ink`...); `[data-theme="dark"]` swaps their values.
Atkinson Hyperlegible Next, self-hosted by `next/font`. The theme follows the device until the header toggle saves a
choice; `app/theme.ts` sets it in `<head>` before the page draws. The printed sheet keeps its own look in both themes.

## Consequences
A new colour is a token with a dark value, never a raw Tailwind colour. The theme is all the site keeps in the
browser. A change around the preview is print-checked in both themes.
