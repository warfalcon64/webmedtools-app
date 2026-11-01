# WebMedTools

Free printable worksheets for concussion rehabilitation, at **[webmedtools.com](https://webmedtools.com)**.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/eye-test-dark.png">
  <img alt="The eye test page: instructions, the worksheet controls, and the preview of the first printed sheet" src="docs/images/eye-test-light.png">
</picture>

## What it does

The first tool is the **eye test**: worksheets for practising saccades, the quick jumps the eyes make between points,
following the Michigan saccades eye test guidelines. Each exercise hides the letters a to z, in order, among random
words. The patient circles the a, then the next b after it, and so on to z, and writes down how long it took.

Choose 1 to 100 exercises on US Letter or A4. Every worksheet is new, and the preview on screen is exactly what
prints. For a PDF, choose "Save as PDF" in the browser's print dialog.

**Not medical advice.** These tools support exercises a clinician has recommended. Stop and talk to your clinician if
symptoms get worse.

## Why

Patients in concussion rehabilitation practise their eye movements on printed sheets like these, and this site makes a
fresh one on demand. It began as a Java app in 2023 and was rebuilt for the web as the first of several
rehabilitation tools. Two practising doctors, check each tool within their field
before it ships. The site is free and will be supported by ads in the future.

## Roadmap

1. A cognitive worksheet for attention and scanning practice, most likely letter cancellation.
2. An exercise done on screen, such as a smooth-pursuit dot or a saccade trainer.
3. About and Privacy pages, then ads, kept out of the printed sheets and the exercises.

The open designs are in [docs/spec.md](docs/spec.md).

## How it's built

Next.js 16, React 19, TypeScript and Tailwind CSS 4. `next build` pre-renders every page to static HTML, which
Cloudflare Workers serves. There is no server, database or account: worksheets are generated in the browser. Pages
live in `app/`, and each tool's logic in `lib/`, as plain TypeScript with its tests beside it.
[docs/architecture.md](docs/architecture.md) says which file to open.

## Design choices

Each links to the decision record that explains it.

- **Static pages, no server** ([ADR 0004](docs/adr/0004-next-js-static-export.md)). Pre-built HTML loads fast and is
  readable by search engines. A server comes only when a tool needs one.
- **The preview is the printed page** ([ADR 0005](docs/adr/0005-worksheets-print-from-the-browser.md)). There is no
  PDF library: sheets are measured in the browser and printed as shown.
- **Worksheet rules** ([ADR 0002](docs/adr/0002-worksheet-rules.md)). The letters a to z in order, one per word, with
  0 to 4 filler words between targets that never hold the next letter.
- **A readable look** ([ADR 0006](docs/adr/0006-site-look-and-themes.md)). Atkinson Hyperlegible, a typeface made for
  low-vision readers, in light and dark. The printed sheet keeps its plain look.

## Run it locally

Needs Node 22.12 or later.

```sh
npm install
npm run dev        # http://localhost:3000
npm test
npm run typecheck
npm run build      # the static site, in out/
```

## How it's developed

Built with [Claude Code](https://claude.com/claude-code) through [Sestina](https://github.com/warfalcon64/Sestina).
Every change walks six phases (brainstorm, plan, implement, peer review, harden, merge prep), and the owner signs off
on the design, the go-ahead and the commit. Peer review sends each diff to a model from another family, and each
finding is checked against the code before it is acted on.

Two scripts check the served build for real. `npm run print-check` prints worksheets in Chrome and Firefox, in both
themes, on Letter and A4, and fails unless every PDF matches its preview sheet for sheet and line for line.
`npm run shots` screenshots every page in both themes at desktop and phone width.

The decision records are in [docs/adr/](docs/adr/README.md), and the notes for coding agents in
[CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE)
