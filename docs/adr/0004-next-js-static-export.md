# 0004. Next.js with static export; no server until a tool needs one

Date: 2026-09-22

## Context
The site is to carry ads and be found through search, so every page must arrive as pre-built HTML, and hosting must
allow commercial use. The tools compute everything in the browser. Java/Vaadin was dropped because it needs a
running server just to generate text. Plain Vite + React was dropped because its pages are empty until JavaScript
runs, which is weak for search and ad review.

## Decision
Next.js (App Router, TypeScript, Tailwind) with `output: "export"` in `next.config.ts`. `npm run build` writes
static HTML to `out/`, which Cloudflare Workers serves as static assets with no Worker script (`wrangler.jsonc`).
Workers Builds deploys every push to `main`. Not Cloudflare Pages: Cloudflare now steers new projects to Workers.

## Consequences
Nothing that needs a server is allowed: server actions, route handlers that read the request, redirects, headers,
rewrites, and `next/image` with the default loader. Going dynamic means removing the `output` line and moving to a
host that runs Next; brainstorm it first. Vercel's free tier is out because it is non-commercial.
