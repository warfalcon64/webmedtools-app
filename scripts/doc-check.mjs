#!/usr/bin/env node
/**
 * Docs check: catch the cheap ways a repo's docs stop being true, and fail on them.
 *
 * A development tool, deliberately outside whatever the repo builds: Node 18+ and nothing else (no package.json, no
 * install, no build step), so it can be copied into a repo in any language. It only reads.
 *
 * `node scripts/doc-check.mjs --help` lists the flags (`USAGE` below). Run from anywhere in the repo, it reads
 * `CLAUDE.md` and `docs/**\/*.md` from the git root, skipping `docs/handoff.md`, and prints one line per problem as
 * `<file>[:<line>] <what>`. It exits 1 when anything fails; a warning alone exits 0. It fails:
 * - a record (`docs/adr/NNNN-*.md`) of 400 words or more, counted the way `wc -w` counts them;
 * - a record with no row in `docs/adr/README.md` (a row's dead link fails with every other link);
 * - a relative inline link, `[text](path)`, that does not resolve (`http(s):`, `mailto:` and `#` links are skipped;
 *   reference-style links, and links leaving the repo, are not read);
 * - a `` `path:line` `` pointer whose file is missing (when the path has a `/`) or shorter than that line. A pointer
 *   that now lands on a different line still passes: only one that runs past the end is caught. One outside the repo
 *   (`~/...`, `/...`) is not read;
 * - a cited record that does not exist (`ADR 0001`, `ADRs 0001, 0002`, and the numbers that end a rule). Citations and
 *   pointers inside fenced code are examples, not read;
 * - a `## Rules` item in CLAUDE.md that cites no ADR, at its end or as `ADR NNNN` within it (skipped with no Rules
 *   section);
 * - a multi-word placeholder from the kit's template left in a fill-in file (`PLACEHOLDERS`).
 * It warns past 40 records: merging them is a judgment, not a failure.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const WORD_CAP = 400
const RECORD_WARN = 40
const ADR_DIR = 'docs/adr'
const ADR_INDEX = 'docs/adr/README.md'
const SKIPPED = new Set(['docs/handoff.md'])
const RECORD = /^\d{4}-.+\.md$/
/** The files a repo writes for itself from the template. A leftover 0001-template.md is caught by the index check. */
const FILL_INS = new Set(['CLAUDE.md', 'docs/architecture.md', 'docs/glossary.md', 'docs/spec.md', 'docs/workflow/project.md'])

/**
 * The template's multi-word placeholders, whitespace collapsed; a test keeps this equal to `template/`. Single-word
 * ones (`<dev>`, `<path>`, `<term>`) are left out: they collide with real command syntax, and each sits beside a
 * multi-word one that is caught.
 */
export const PLACEHOLDERS = [
  '<One line: what the project is and the stack. Two at most.>',
  '<Any command that costs money or minutes, with when to run it and when not to.>',
  '<How the project\'s real output is checked without a person: the command, and what to look at.>',
  '<One line per rule that a fresh session would otherwise break, each ending with the ADR that decided it. Ten to fifteen lines. A rule with no ADR is an opinion; write the ADR or drop the rule.>',
  '<Palette, icons, copy voice: the things that make a diff look wrong before it is wrong. Delete if no UI.>',
  '<If the map and glossary are deferred (BOOTSTRAP §1), replace their two lines above with one saying they are not written yet and what starts them.>',
  '<Two to five lines: what comes next and in what order, pointing at spec sections. Rewritten at every merge prep. This is the paragraph the next session reads first, so it must be true on the day it is read.>',
  '<what it may depend on>',
  '<One or two sentences on the rule the table encodes, with the ADR number that decided it.>',
  '<One bullet per file or module that matters: what it owns, and the ADR that constrains it. Paths in backticks.>',
  '<A key flow, numbered>',
  '<Entry point>',
  '<Next step, with the file.>',
  '<Data on disk, config, fixtures, scripts: one line each with its path.>',
  '<Designed but not built: pointer to the spec section. One line each. Delete the line when it ships.>',
  '<one line: what it is, and what it is not when that is the confusion>',
  '<file or symbol>',
  '<One line on where the project stands: which sections are built, which section lists what is next.>',
  '<What the project is for and what it is measured against. Rarely changes.>',
  '<First area>',
  '<Problem, then the options with their costs, then the constraints (name the ADRs). The brainstorm phase picks.>',
  '<An ordered list of what is next, one bold line each with its section number, and why it comes before the next. CLAUDE.md\'s "Next up" paragraph is a summary of this list, never a second copy of it.>',
  '<typecheck command>',
  '<test command>',
  '<the command this repo runs, with how it gets the key>',
  '<The model, when not the default; what review cannot see here and what stands in for it.>',
  '<If Node or a key is not available, replace this line with: phase 4 is the lead\'s own read of the diff, and the verdict list says no outside model reviewed it. Without Node, also drop the docs check from Checks.>',
  '<What tests cannot see and how it is checked for real: a prompt change needs a real model call, a UI change needs a screenshot, a migration needs an old file. Name the command for each.>',
  '<Where the project writes, how it is read back, and what an added field needs so old files still load. Delete this line if the project keeps no data.>',
  '<Title as a sentence: the decision itself, not the topic>',
  '<The problem as it stood, in two to five sentences. Include the approach that was rejected or reversed, in one sentence, so it does not come back: "X was tried and failed because Y" is the most valuable line in the file.>',
  '<What is done, and where in the code: file paths, function names, flags. A record with no file pointer cannot be checked against the code and will rot.>',
  '<What this forbids, what it costs, and what a later session must keep true. Cross-reference other records by number.>'
]

// ---------- pure helpers (exported for tests) ----------

/** Whitespace-separated words, as `wc -w` counts them. */
export function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length
}

/** The 1-based line `index` falls on. */
function lineAt(text, index) {
  return text.slice(0, index).split('\n').length
}

/**
 * Fenced blocks blanked to spaces, so offsets still hold: indented ones in a list item too, and a fence closes only
 * on a bare run of at least its own length, so a longer fence can show a shorter one, info string and all.
 */
function withoutFences(text) {
  return text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[`~]*[ \t]*$/gm, (block) => block.replace(/[^\n]/g, ' '))
}

/** Fenced blocks and inline code blanked to spaces. */
function withoutCode(text) {
  return withoutFences(text).replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
}

/** The record files each index row links, and where; a row is any table line linking `NNNN-*.md`. */
export function indexLinks(indexText) {
  const links = []
  indexText.split('\n').forEach((line, i) => {
    if (!line.trimStart().startsWith('|')) return
    for (const { target } of relativeLinks(line)) {
      const file = target.split('/').pop()
      if (RECORD.test(file)) links.push({ file, line: i + 1 })
    }
  })
  return links
}

/** Records with no row in the index. A row linking no record is a dead link, failed with every other. */
export function indexProblems(indexText, recordFiles) {
  const linked = new Set(indexLinks(indexText).map((l) => l.file))
  return recordFiles.filter((file) => !linked.has(file)).map((file) => ({ line: null, what: `has no row for ${file}` }))
}

/** Relative inline link targets outside code, anchors and titles stripped; web, mail and same-page links skipped. */
export function relativeLinks(text) {
  const out = []
  const plain = withoutCode(text)
  // A target may hold one level of balanced parentheses (`screen(1).png`); a title may be "...", '...' or (...).
  for (const m of plain.matchAll(/\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g)) {
    let target = m[1].replace(/^<|>$/g, '')
    if (/^([a-z][a-z0-9+.-]*:|#|~|\/\/)/i.test(target)) continue
    target = target.split(/[#?]/)[0]
    if (!target) continue
    try {
      target = decodeURIComponent(target)
    } catch {
      /* keep it as written */
    }
    out.push({ target, line: lineAt(plain, m.index) })
  }
  return out
}

/**
 * `` `path:line` `` pointers: a backticked span that is a file path with an extension, a colon and a line (or a range,
 * whose end is kept). `:44` alone, a URL or a host and port is not one. A dotted host (`db.example.com:5432`) looks
 * like a file, so `checkRepo` fails a pointer only when its path has a `/` or names a file that exists.
 */
export function pointers(text) {
  const out = []
  for (const m of text.matchAll(/`([\w.~/-]*[\w-]\.[A-Za-z][\w]*):(\d+)(?:[-–](\d+))?`/g)) {
    if (/^(https?|localhost)\b/.test(m[1]) || /^[\d.]+$/.test(m[1])) continue
    out.push({ path: m[1], target: Number(m[3] ?? m[2]), line: lineAt(text, m.index) })
  }
  return out
}

const NUMBERS = String.raw`\d{4}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*[–-]\s*)\d{4})*`

/** The four-digit numbers in a cited span, a range (`0001–0004`) taken whole. */
function numbersIn(span) {
  const out = []
  for (const [, from, to] of span.matchAll(/(\d{4})(?:\s*[–-]\s*(\d{4}))?/g)) {
    if (!to || Number(to) <= Number(from)) out.push(from)
    else for (let n = Number(from); n <= Number(to); n++) out.push(String(n).padStart(4, '0'))
  }
  return out
}

/** Record numbers cited as `ADR NNNN`, `ADRs NNNN, NNNN and NNNN` or `ADRs NNNN–NNNN`, with the line of each. */
export function citations(text) {
  const out = []
  for (const m of text.matchAll(new RegExp(String.raw`\bADRs?\s+(${NUMBERS})`, 'g'))) {
    const line = lineAt(text, m.index)
    for (const number of numbersIn(m[1])) out.push({ number, line })
  }
  return out
}

/** The record numbers a rule ends with: `ADR 0001.`, `(ADR 0001)`, `(0001)` or `(ADR 0014, 0027)`; null if none. */
export function ruleCitation(rule) {
  const m = new RegExp(String.raw`(?:\bADRs?\s+(${NUMBERS})|\((?:ADRs?\s+)?(${NUMBERS})\))[.;]?\s*$`).exec(rule.trim())
  return m ? numbersIn(m[1] ?? m[2]) : null
}

/**
 * The record numbers a rule cites: every `ADR NNNN` in it, wherever it stands (`The rules are in ADR 0002; ...`), else
 * the bare `(NNNN)` it ends with; null when it cites none. An explicit `ADR` wins, so a rule ending `(8080)` after one
 * is not read as citing 8080.
 */
export function ruleNumbers(rule) {
  const cited = citations(rule).map((c) => c.number)
  return cited.length ? cited : ruleCitation(rule)
}

/**
 * The items of CLAUDE.md's `## Rules` section, each joined with its indented continuation lines; null with no such
 * section. An item starts at a `- ` line and ends at a blank line, a sub-bullet, unindented text or any heading, so
 * prose or sub-bullets after a rule never bury its citation.
 */
export function ruleItems(claudeText) {
  const lines = claudeText.split('\n')
  const start = lines.findIndex((l) => /^##\s+Rules\s*$/.test(l))
  if (start < 0) return null
  const items = []
  let open = false
  for (let i = start + 1; i < lines.length && !/^#+\s/.test(lines[i]); i++) {
    if (/^[-*]\s/.test(lines[i])) {
      items.push({ text: lines[i].slice(2).trim(), line: i + 1 })
      open = true
    } else if (open && /^\s+\S/.test(lines[i]) && !/^\s+[-*]\s/.test(lines[i])) {
      items[items.length - 1].text += ` ${lines[i].trim()}`
    } else {
      open = false
    }
  }
  return items
}

/** Each `PLACEHOLDERS` entry left in `text`, matched across any whitespace, with its line. */
export function placeholderHits(text, placeholders = PLACEHOLDERS) {
  const out = []
  for (const p of placeholders) {
    const pattern = p.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    const m = new RegExp(pattern).exec(text)
    if (m) out.push({ placeholder: p.length > 50 ? `${p.slice(0, 47)}...` : p, line: lineAt(text, m.index) })
  }
  return out
}

export const USAGE = [
  'usage: node scripts/doc-check.mjs   checks CLAUDE.md and docs/ from the git root; exits 1 on any failure',
  '  --help, -h   print this'
].join('\n')

// ---------- the repo ----------

/** Every `.md` under `dir`, as paths relative to `root` with forward slashes. */
function markdownUnder(root, dir) {
  const full = join(root, dir)
  if (!existsSync(full)) return []
  const out = []
  for (const name of readdirSync(full).sort()) {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory()) out.push(...markdownUnder(root, rel))
    else if (name.endsWith('.md')) out.push(rel)
  }
  return out
}

function lineCount(path) {
  const text = readFileSync(path, 'utf8')
  return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

/** Every failure and warning in the repo at `root`, each as `{ file, line, what }`. */
export function checkRepo(root) {
  const failures = []
  const warnings = []
  const fail = (file, line, what) => failures.push({ file, line, what })
  const docs = [...(existsSync(join(root, 'CLAUDE.md')) ? ['CLAUDE.md'] : []), ...markdownUnder(root, 'docs')].filter((f) => !SKIPPED.has(f))
  const records = existsSync(join(root, ADR_DIR)) ? readdirSync(join(root, ADR_DIR)).filter((n) => RECORD.test(n)).sort() : []
  const numbers = new Set(records.map((n) => n.slice(0, 4)))

  for (const name of records) {
    const words = wordCount(readFileSync(join(root, ADR_DIR, name), 'utf8'))
    if (words >= WORD_CAP) fail(`${ADR_DIR}/${name}`, null, `is ${words} words; a record stays under ${WORD_CAP}`)
  }
  if (records.length > RECORD_WARN) warnings.push({ file: ADR_DIR, line: null, what: `holds ${records.length} records; past ~${RECORD_WARN}, merge or prune` })
  if (existsSync(join(root, ADR_INDEX))) {
    for (const p of indexProblems(readFileSync(join(root, ADR_INDEX), 'utf8'), records)) fail(ADR_INDEX, p.line, p.what)
  } else if (records.length) {
    fail(ADR_INDEX, null, 'is missing, so no record has a row')
  }

  for (const file of docs) {
    const text = readFileSync(join(root, file), 'utf8')
    for (const { target, line } of relativeLinks(text)) {
      const path = target.startsWith('/') ? join(root, target) : join(root, dirname(file), target)
      if (relative(root, path).startsWith('..')) continue // outside the repo, which is all this reads
      if (!existsSync(path)) fail(file, line, `links ${target}, which does not exist`)
    }
    const prose = withoutFences(text) // a fenced example cites and points at nothing
    for (const { path, target, line } of pointers(prose)) {
      if (/^[~/]/.test(path)) continue // outside the repo, which is all this reads
      // Tried from the root, then from the doc's folder; a candidate outside the repo is never read.
      const inside = [join(root, path), join(root, dirname(file), path)].filter((p) => !relative(root, p).startsWith('..'))
      if (!inside.length) continue
      const found = inside.find((p) => existsSync(p) && statSync(p).isFile())
      if (!found) {
        if (path.includes('/')) fail(file, line, `points at ${path}:${target}, but ${path} does not exist`)
      }
      else if (lineCount(found) < target) fail(file, line, `points at ${path}:${target}, but ${path} has ${lineCount(found)} lines`)
    }
    for (const { number, line } of citations(prose)) if (!numbers.has(number)) fail(file, line, `cites ADR ${number}, which does not exist`)
    if (FILL_INS.has(file)) {
      for (const { placeholder, line } of placeholderHits(text)) fail(file, line, `still holds the placeholder ${placeholder}`)
    }
  }

  if (existsSync(join(root, 'CLAUDE.md'))) {
    for (const { text, line } of ruleItems(withoutFences(readFileSync(join(root, 'CLAUDE.md'), 'utf8'))) ?? []) {
      const cited = ruleNumbers(text)
      if (!cited) fail('CLAUDE.md', line, 'has a rule that cites no ADR')
      // An `ADR NNNN` was checked by the scan of every file above; only a bare `(NNNN)` is left to check here.
      else if (!citations(text).length) {
        for (const n of cited) if (!numbers.has(n)) fail('CLAUDE.md', line, `cites ADR ${n}, which does not exist`)
      }
    }
  }
  return { failures, warnings }
}

/** One problem as `<file>[:<line>] <what>`. */
export function formatProblem({ file, line, what }) {
  return `${file}${line ? `:${line}` : ''} ${what}`
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (err) {
    throw new Error(err?.code === 'ENOENT' ? 'git is not installed, or not on PATH.' : 'Not inside a git repository.')
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    return
  }
  if (args.length) {
    for (const arg of args) console.error(`Unknown argument: ${arg}`)
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  const { failures, warnings } = checkRepo(repoRoot())
  for (const w of warnings) console.log(`warning: ${formatProblem(w)}`)
  for (const f of failures) console.log(formatProblem(f))
  if (failures.length) process.exitCode = 1
}

// Only run when invoked directly, so the helpers above can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('doc-check.mjs')) {
  try {
    main()
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
