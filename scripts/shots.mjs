#!/usr/bin/env node
/**
 * Screenshots of the running build, in light and dark, at desktop and phone width.
 *
 *   npm run shots                                   every page into .checks/shots/
 *   npm run shots -- --css variant.css --name glow  inject a stylesheet first: try a look without touching the code
 *   npm run shots -- --pages /eye-test              only some pages (comma-separated)
 *
 * Files are named <name>-<page>-<theme>-<size>.png. Serve the build first: npm run build && npx wrangler dev --port 8788
 */
import { mkdirSync, readFileSync } from "node:fs";
import { CHECKS_DIR, DEFAULT_URL, launch, parseFlags, requireServer } from "./browsers.mjs";

const SIZES = {
  desktop: { width: 1280, height: 1100, deviceScaleFactor: 1 },
  // Phone width needs device emulation: a plain window never goes below 500 px.
  phone: { width: 390, height: 1500, deviceScaleFactor: 2, isMobile: true },
};

/** The file a shot goes to: "/" is "home", "/eye-test" is "eye-test". */
export function shotName(name, path, theme, size) {
  const page = path.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "home";
  return `${name}-${page}-${theme}-${size}.png`;
}

async function main() {
  const opts = parseFlags(process.argv.slice(2), {
    url: DEFAULT_URL,
    pages: "/,/eye-test",
    css: "",
    name: "shot",
    out: `${CHECKS_DIR}/shots`,
  });
  await requireServer(opts.url);
  const css = opts.css ? readFileSync(opts.css, "utf8") : "";
  mkdirSync(opts.out, { recursive: true });

  const browser = await launch("chrome");
  for (const theme of ["light", "dark"]) {
    for (const [size, viewport] of Object.entries(SIZES)) {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
      await page.setViewport(viewport);
      for (const path of opts.pages.split(",")) {
        await page.goto(opts.url + path, { waitUntil: "networkidle0" });
        if (css) await page.addStyleTag({ content: css });
        await page.evaluate(() => document.fonts.ready);
        const file = `${opts.out}/${shotName(opts.name, path, theme, size)}`;
        await page.screenshot({ path: file });
        console.log(file);
      }
      await page.close();
    }
  }
  await browser.close();
}

if (process.argv[1]?.endsWith("shots.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
