#!/usr/bin/env node
/**
 * Prints the eye test from the running build and checks each PDF against the preview it came from (ADR 0005): the
 * page count, the paper size, and every exercise line breaking where the preview breaks it.
 *
 *   npm run print-check                                        Chrome and Firefox, light and dark, Letter and A4
 *   npm run print-check -- --browsers firefox --themes dark    a narrower run (comma-separated lists)
 *
 * PDFs go to .checks/print/. Needs poppler's pdfinfo and pdftotext. Safari cannot print under automation; the owner
 * checks it by hand. Serve the build first: npm run build && npx wrangler dev --port 8788
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { CHECKS_DIR, DEFAULT_URL, launch, listFlag, parseFlags, requireServer } from "./browsers.mjs";

// Paper sizes in points; browsers round A4 differently (Chrome 594.96 x 841.92, Firefox 596 x 842).
const PAPER_POINTS = { letter: [612, 792], a4: [595.28, 841.89] };
const TOLERANCE = 2;

// Lines on a sheet that are not exercise text: "Exercise 3" and the alphabet (pdftotext may run them together, or drop
// the space in "Exercise3"), and the timing blank.
const SHEET_FURNITURE = [
  /^Exercise\s*\d+/,
  /^a b c d e f g h i j k l m n o p q r s t u v w x y z$/,
  /Min\. ___ Sec\.$/,
];

// An exercise's words: the one paragraph in a sheet at this line height (app/eye-test/Worksheet.tsx).
const EXERCISE_TEXT = "p.leading-\\[1\\.6\\]";

const squash = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Compares one sheet's preview lines with its PDF page's text. `ok` needs the page's text, less the sheet's own
 * furniture, to be exactly the preview's lines: each whole, once, in order.
 */
export function comparePage(previewLines, pdfText) {
  const body = pdfText
    .split("\n")
    .map(squash)
    .filter((l) => l && !SHEET_FURNITURE.some((re) => re.test(l)));
  const want = previewLines.map(squash);
  const ok = body.length === want.length && body.every((line, k) => line === want[k]);
  const missing = want.filter((l) => !body.includes(l));
  const extra = body.filter((l) => !want.includes(l));
  return { ok, missing, extra };
}

/** Whether a PDF page size, "612 x 792 pts (letter)", is the paper asked for. */
export function paperMatches(pageSize, paper) {
  const [w, h] = pageSize.match(/[\d.]+/g).map(Number);
  const [pw, ph] = PAPER_POINTS[paper];
  return Math.abs(w - pw) <= TOLERANCE && Math.abs(h - ph) <= TOLERANCE;
}

// Generates `count` exercises on `paper`, then reads each sheet's exercise lines as the preview lays them out: words
// grouped by the top of their box.
async function previewSheets(page, paper, count) {
  await page.select("select", paper);
  await page.$eval(
    "input[type=number]",
    (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    count,
  );
  // A new worksheet has new words: wait until the first exercise's text changes, not for a fixed time.
  const firstText = (selector) => document.querySelector(`section ${selector}`)?.textContent ?? "";
  const before = await page.evaluate(firstText, EXERCISE_TEXT);
  await page.$$eval("button", (bs) => bs.find((b) => b.textContent.trim() === "New worksheet").click());
  await page.waitForFunction(
    (selector, old) => (document.querySelector(`section ${selector}`)?.textContent ?? "") !== old,
    {},
    EXERCISE_TEXT,
    before,
  );
  return page.$$eval(
    "section",
    (sections, selector) =>
      sections.map((s) =>
        Array.from(s.querySelectorAll(selector)).flatMap((p) => {
          const text = p.firstChild;
          const lines = [];
          let top = null;
          for (const m of text.data.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, m.index);
            range.setEnd(text, m.index + m[0].length);
            const t = Math.round(range.getClientRects()[0].top);
            if (top === null || Math.abs(t - top) > 4) (lines.push([]), (top = t));
            lines[lines.length - 1].push(m[0]);
          }
          return lines.map((l) => l.join(" "));
        }),
      ),
    EXERCISE_TEXT,
  );
}

async function main() {
  const opts = parseFlags(process.argv.slice(2), {
    url: DEFAULT_URL,
    browsers: "chrome,firefox",
    themes: "light,dark",
    papers: "letter,a4",
    count: "7",
    out: `${CHECKS_DIR}/print`,
  });
  const kinds = listFlag(opts.browsers, ["chrome", "firefox"], "browsers");
  const themes = listFlag(opts.themes, ["light", "dark"], "themes");
  const papers = listFlag(opts.papers, Object.keys(PAPER_POINTS), "papers");
  await requireServer(opts.url);
  mkdirSync(opts.out, { recursive: true });
  let failed = false;

  for (const kind of kinds) {
    const browser = await launch(kind);
    for (const theme of themes) {
      for (const paper of papers) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1000 });
        await page.goto(`${opts.url}/eye-test`, { waitUntil: "networkidle0" });
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        const sheets = await previewSheets(page, paper, opts.count);

        const pdf = `${opts.out}/${kind}-${theme}-${paper}.pdf`;
        writeFileSync(pdf, await page.pdf({ printBackground: true, preferCSSPageSize: true }));
        const info = execFileSync("pdfinfo", [pdf]).toString();
        const pages = Number(info.match(/Pages:\s+(\d+)/)[1]);
        const pageSize = info.match(/Page size:\s+(.*)/)[1];
        const problems = [];
        if (pages !== sheets.length) problems.push(`${pages} PDF pages for ${sheets.length} sheets`);
        if (!paperMatches(pageSize, paper)) problems.push(`page size ${pageSize}`);
        sheets.forEach((lines, i) => {
          if (i >= pages) return;
          const text = execFileSync("pdftotext", ["-raw", "-f", `${i + 1}`, "-l", `${i + 1}`, pdf, "-"]).toString();
          const { ok, missing, extra } = comparePage(lines, text);
          if (!ok) {
            const detail = missing.length || extra.length ? "" : " (lines repeated or out of order)";
            problems.push(
              `sheet ${i + 1}${detail}: missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`,
            );
          }
        });

        const label = `${kind} ${theme} ${paper}: ${sheets.length} sheets`;
        console.log(problems.length ? `FAIL ${label}\n  ${problems.join("\n  ")}` : `ok   ${label}, lines match`);
        failed ||= problems.length > 0;
        await page.close();
      }
    }
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith("print-check.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
