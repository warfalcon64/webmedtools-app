# 0006. The site's look: rounded blues in Atkinson Hyperlegible, light and dark

Date: 2026-09-24

## Context
The MVP looked unfinished (spec §2). Three rendered directions were shown: calm clinical, warm and friendly, high
legibility. The owner took the warm one's rounded shapes, in blue, with the legibility one's typeface, plus dark mode:
light sensitivity is common after concussion. Outlining only the white boxes was tried and read as inconsistent. A pale
glow on a near-black dark canvas read as a grey haze, not a shadow; brighter and tighter halos were tried and rejected.

## Decision
Colours are roles in `app/globals.css` (`bg-canvas`, `text-ink`...); `[data-theme="dark"]` swaps their values.
Atkinson Hyperlegible Next, self-hosted by `next/font`. The theme follows the device until the header toggle saves a
choice; `app/theme.ts` sets it in `<head>` before the page draws. Panels have no outline: each is `rounded-panel
glow`, a blurred blue-to-periwinkle copy of its shape behind it. In both themes the glow is darker than the canvas, a
shadow and never a halo, so the dark canvas sits a step off black (#1a2431) to leave it room. Fields keep a border.
The printed sheet keeps its own look. The mark (`app/icon.svg`, the header) is a pulse whose peaks form a W, on that
gradient: the site is a hub of medical tools, so not a tick or an eye.

## Consequences
A new colour is a token with a dark value, never a raw Tailwind colour; a new panel is `rounded-panel glow`, never its
own border or shadow. The theme is all the site keeps in the browser. Changes near the preview get print-checked in
both themes.
