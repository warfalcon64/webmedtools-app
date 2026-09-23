#!/usr/bin/env node
/**
 * Peer review: send the uncommitted change to a model from another family and print what it finds.
 *
 * A development tool, deliberately outside whatever the repo builds: Node 18+ and nothing else (no package.json, no
 * install, no build step), so it can be copied into a repo in any language.
 *
 *   node scripts/peer-review.mjs                     review the working tree against HEAD (everything, before a first commit)
 *   node scripts/peer-review.mjs --base main         review a branch
 *   node scripts/peer-review.mjs --model <id>        a stronger reviewer for an important change
 *   node scripts/peer-review.mjs --dry-run           print the pack size and file list, call nothing
 *   node scripts/peer-review.mjs --max-tokens <n>    refuse to send a pack bigger than this (default 400000)
 *
 * The OpenRouter key comes from OPENROUTER_API_KEY, or from --key-file: a file holding the key alone, or JSON with
 * an `openrouterApiKey` field. Findings are advisory: check every one against the code and give it a verdict.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = process.env.PEER_REVIEW_MODEL ?? 'moonshotai/kimi-k3'
const TIMEOUT_MS = 20 * 60 * 1000
const OUT_DIR = '.peer-review'

const LOCKFILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'composer.lock', 'Cargo.lock', 'poetry.lock',
  'Pipfile.lock', 'uv.lock', 'Gemfile.lock', 'go.sum', 'gradle.lockfile', 'packages.lock.json', 'pubspec.lock', 'mix.lock',
  'Package.resolved', 'flake.lock'
])
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|icns|pdf|zip|gz|tgz|bz2|7z|rar|mp[34]|mov|avi|webm|wav|ogg|ttf|otf|woff2?|eot|wasm|so|dylib|dll|exe|bin|db|sqlite3?|lockb)$/i

// ---------- pure helpers (exported for tests) ----------

/**
 * Whether a touched file's current text belongs in the pack, and why not when it does not.
 * `sizeBytes` is null when the file no longer exists (deleted by the change).
 */
export function fileDecision(path, sizeBytes, opts = {}) {
  const maxBytes = (opts.maxFileKb ?? 120) * 1024
  const name = path.split('/').pop() ?? path
  if (sizeBytes === null) return { include: false, reason: 'deleted' }
  if (opts.ignored) return { include: false, reason: 'git-ignored' }
  if (LOCKFILES.has(name)) return { include: false, reason: 'lockfile' }
  if (BINARY_EXT.test(path)) return { include: false, reason: 'binary' }
  if (sizeBytes > maxBytes) return { include: false, reason: `${Math.round(sizeBytes / 1024)} KB over the ${opts.maxFileKb ?? 120} KB cap` }
  return { include: true, reason: '' }
}

/** Text that is not really text: a NUL byte is the cheap, reliable tell. */
export function looksBinary(text) {
  return text.includes('\u0000')
}

/**
 * Pull the JSON object out of a reply that may be fenced, prefaced or followed by prose.
 * Returns null rather than throwing: a model that ignored the format should not crash the tool.
 */
export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const unfenced = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
  for (const candidate of [unfenced, text.trim()]) {
    try {
      return JSON.parse(candidate)
    } catch {
      /* try the braces */
    }
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
  }
  return null
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }

/** Normalise whatever came back into { summary, findings[] }, sorted worst first. */
export function normalizeReview(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const findings = Array.isArray(raw.findings) ? raw.findings : []
  const clean = findings
    .filter((f) => f && typeof f === 'object' && (f.claim || f.scenario))
    .map((f) => ({
      file: String(f.file ?? '').trim(),
      line: typeof f.line === 'number' ? f.line : null,
      severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium',
      claim: String(f.claim ?? '').trim(),
      scenario: String(f.scenario ?? '').trim(),
      confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : null
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  return { summary: String(raw.summary ?? '').trim(), findings: clean }
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

const VALUE_FLAGS = new Set(['--base', '--model', '--focus', '--max-file-kb', '--max-tokens', '--key-file'])

export const USAGE =
  'usage: node scripts/peer-review.mjs [--base <ref>] [--model <id>] [--focus "<text>"] [--max-file-kb <n>] [--max-tokens <n>] [--key-file <path>] [--dry-run]'

/**
 * Both `--flag value` and `--flag=value` are accepted. Anything unrecognised, and any value flag left without a
 * value, lands in `unknown` rather than being dropped: a typo must not quietly review the wrong thing.
 */
export function parseArgs(argv) {
  const out = { base: 'HEAD', model: DEFAULT_MODEL, focus: '', dryRun: false, maxFileKb: 120, maxTokens: 400000, keyFile: '', unknown: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const eq = arg.indexOf('=')
    const flag = eq > 0 ? arg.slice(0, eq) : arg
    let value = null
    if (VALUE_FLAGS.has(flag)) {
      value = eq > 0 ? arg.slice(eq + 1) : (argv[++i] ?? null)
      if (!value) {
        out.unknown.push(`${flag} (missing value)`)
        continue
      }
    } else if (eq > 0) {
      out.unknown.push(arg)
      continue
    }
    if (flag === '--base') out.base = value
    else if (flag === '--model') out.model = value
    else if (flag === '--focus') out.focus = value
    else if (flag === '--max-file-kb') out.maxFileKb = Number(value) || out.maxFileKb
    else if (flag === '--max-tokens') out.maxTokens = Number(value) || out.maxTokens
    else if (flag === '--key-file') out.keyFile = value
    else if (flag === '--dry-run') out.dryRun = true
    else if (flag === '--help' || flag === '-h') out.help = true
    else out.unknown.push(arg)
  }
  return out
}

// ---------- git ----------

/**
 * Run git and fail loudly. None of the commands here exit non-zero on a normal result (`git diff` without
 * `--exit-code` reports differences with status 0), so a non-zero exit always means the run cannot continue.
 */
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim().split('\n')[0] : ''
    throw new Error(`git ${args.join(' ')} failed: ${stderr || err?.message || 'unknown error'}`)
  }
}

/** The repo root, so every path below is read the same way whatever directory the command was run from. */
function repoRoot() {
  try {
    return git(['rev-parse', '--show-toplevel']).trim()
  } catch {
    throw new Error('Not inside a git repository.')
  }
}

function resolvesToCommit(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

/**
 * What to diff against, and how to name it. A repo with no commits has a HEAD that resolves to nothing; its change
 * is everything, so it is diffed against the empty tree. Any other base git cannot resolve is said plainly instead
 * of as a git fatal.
 */
export function resolveBase(base) {
  if (resolvesToCommit(base)) return { ref: base, label: base, empty: false }
  if (base === 'HEAD') {
    // Hashed rather than hard-coded, so a SHA-256 repo gets its own empty tree.
    const emptyTree = execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { encoding: 'utf8', input: '' }).trim()
    return { ref: emptyTree, label: 'the empty tree (no commits yet)', empty: true }
  }
  throw new Error(`Unknown base "${base}".`)
}

function untrackedFiles() {
  return git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
}

function changedFiles(base) {
  return git(['diff', '--name-only', base]).split('\n').filter(Boolean)
}

/**
 * The pathspec for the diff sent to the reviewer: everything but lockfiles, at any depth. Without it a tracked
 * lockfile's whole diff is sent while the report lists it as skipped.
 */
export function diffPathspec() {
  return ['--', '.', ...[...LOCKFILES].map((name) => `:(exclude,glob)**/${name}`)]
}

/** An untracked file has no diff, so render it as one: every line is an addition. */
function additionDiff(path, text) {
  const lines = text.split('\n')
  const body = lines.map((l) => `+${l}`).join('\n')
  return `diff --git a/${path} b/${path}\nnew file\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${body}`
}

function sizeOf(path) {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/** Everything the reviewer sees, plus what was left out and why. */
export function buildPack(opts) {
  const { maxFileKb, focus } = opts
  const { ref: base, label, empty } = resolveBase(opts.base)
  const diff = git(['diff', base, ...diffPathspec()])
  const untracked = untrackedFiles()
  const skipped = []
  const parts = []
  const included = []

  const untrackedDiffs = []
  for (const path of untracked) {
    const size = sizeOf(path)
    const decision = fileDecision(path, size, { maxFileKb })
    if (!decision.include) {
      skipped.push(`${path} (${decision.reason})`)
      continue
    }
    const text = readFileSync(path, 'utf8')
    if (looksBinary(text)) {
      skipped.push(`${path} (binary)`)
      continue
    }
    untrackedDiffs.push(additionDiff(path, text))
    included.push(path)
  }

  const fullDiff = [diff.trim(), ...untrackedDiffs].filter(Boolean).join('\n\n')
  const note = included.length || empty
    ? '\n\nNew files appear here as all-additions diffs. That diff is their full text, so they are not repeated below.'
    : ''
  parts.push(`## The change (git diff against ${label}, plus new files)${note}\n\n\`\`\`diff\n${fullDiff || '(no changes)'}\n\`\`\``)

  const newFiles = new Set(included)
  const touched = [...new Set([...changedFiles(base), ...included])]
  const files = []
  let fullInDiff = 0
  for (const path of touched) {
    if (newFiles.has(path)) continue
    // Against the empty tree a staged file is new too, and its diff already carries its full text.
    if (empty) {
      fullInDiff++
      continue
    }
    const size = sizeOf(path)
    const decision = fileDecision(path, size, { maxFileKb })
    if (!decision.include) {
      if (!skipped.some((s) => s.startsWith(`${path} (`))) skipped.push(`${path} (${decision.reason})`)
      continue
    }
    const text = readFileSync(path, 'utf8')
    if (looksBinary(text)) {
      skipped.push(`${path} (binary)`)
      continue
    }
    files.push(`### ${path}\n\n\`\`\`\n${text}\n\`\`\``)
  }
  if (files.length) parts.push(`## Current text of every touched file that already existed\n\n${files.join('\n\n')}`)

  for (const doc of ['CLAUDE.md', join('docs', 'adr', 'README.md')]) {
    if (!existsSync(doc)) continue
    parts.push(`## ${doc} (project rules the change must respect)\n\n\`\`\`\n${readFileSync(doc, 'utf8')}\n\`\`\``)
  }
  if (focus) parts.push(`## The author asks you to look especially at\n\n${focus}`)

  // A new file is included in full too, as its additions diff.
  return { text: parts.join('\n\n'), base: label, touched, skipped, fileCount: files.length + included.length + fullInDiff, hasChanges: Boolean(fullDiff) }
}

// ---------- the call ----------

const SYSTEM = `You are reviewing a code change written by another AI model. You are the second pair of eyes, from a different family, and your value is catching what its author could not see.

Report only:
- correctness bugs: wrong logic, off-by-one, wrong operator, a case the code does not handle
- broken or missing failure paths: what happens on an error, a timeout, an empty or malformed result
- violations of the project's own rules or decision records that are included below — quote the rule you mean
- tests that are missing, or that assert something other than what they claim
- migration and compatibility risks: saved data that will no longer load, a schema without a default

Never report style, naming, formatting or preference. Never praise. Never restate what the change does. If the change is sound, say so and return an empty findings list — do not invent problems to fill space. Every finding must name a concrete scenario in which the code misbehaves; if you cannot, drop it.

Answer with JSON only, no prose and no code fences:
{"summary": "one or two sentences", "findings": [{"file": "path", "line": 0, "severity": "high|medium|low", "claim": "what is wrong", "scenario": "the case where it breaks", "confidence": 0.0}]}`

/** A key file holds the key alone, or JSON with an `openrouterApiKey` field. */
export function keyFromFileText(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('{')) {
    try {
      const key = JSON.parse(trimmed)?.openrouterApiKey
      return typeof key === 'string' ? key.trim() : ''
    } catch {
      return ''
    }
  }
  return /\s/.test(trimmed) ? '' : trimmed
}

function readKey(keyFile) {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim()
  if (fromEnv) return fromEnv
  if (!keyFile || !existsSync(keyFile)) return ''
  return keyFromFileText(readFileSync(keyFile, 'utf8'))
}

async function callModel({ key, model, prompt }) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  })
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'peer-review' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (res.ok) return res.json()
    const text = await res.text().catch(() => '')
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < 1) {
      console.log(`  ${res.status} from OpenRouter, retrying once…`)
      await new Promise((r) => setTimeout(r, 4000))
      continue
    }
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  }
}

function printReview(review, meta) {
  console.log('')
  console.log(`Reviewer: ${meta.model}`)
  if (meta.usage) {
    const u = meta.usage
    const cost = typeof u.cost === 'number' ? ` · $${u.cost.toFixed(4)}` : ''
    console.log(`Tokens: ${u.prompt_tokens ?? '?'} in, ${u.completion_tokens ?? '?'} out${cost}`)
  }
  if (review.summary) console.log(`\n${review.summary}`)
  if (!review.findings.length) {
    console.log('\nNo findings.')
    return
  }
  console.log('')
  for (const f of review.findings) {
    const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : 'unknown file'
    const conf = f.confidence === null ? '' : ` (confidence ${f.confidence.toFixed(2)})`
    console.log(`[${f.severity.toUpperCase()}] ${where}${conf}`)
    console.log(`  ${f.claim}`)
    if (f.scenario) console.log(`  when: ${f.scenario}`)
    console.log('')
  }
  console.log('Check every finding against the code before acting on it, and give each one a verdict.')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(USAGE)
    return
  }
  if (opts.unknown.length) {
    for (const arg of opts.unknown) console.error(`Unknown argument: ${arg}`)
    console.error(USAGE)
    process.exitCode = 1
    return
  }
  // Git prints paths from the repo root, so read them from there — the command may have been run in a subdirectory.
  if (opts.keyFile) opts.keyFile = resolve(opts.keyFile)
  process.chdir(repoRoot())

  const pack = buildPack(opts)
  const tokens = estimateTokens(pack.text)
  console.log(`Base: ${pack.base} · touched files: ${pack.touched.length} · included in full: ${pack.fileCount}`)
  for (const path of pack.touched) console.log(`  ${path}`)
  if (pack.skipped.length) {
    console.log('Skipped:')
    for (const s of pack.skipped) console.log(`  ${s}`)
  }
  console.log(`Estimated prompt size: ~${tokens.toLocaleString()} tokens`)
  if (opts.dryRun) return
  if (tokens > opts.maxTokens) {
    console.error(`Pack too large: ~${tokens.toLocaleString()} tokens over the ${opts.maxTokens.toLocaleString()} limit. Raise --max-tokens, or lower --max-file-kb, or review a smaller change.`)
    process.exitCode = 1
    return
  }
  if (!pack.hasChanges) {
    console.log('Nothing to review.')
    return
  }

  const key = readKey(opts.keyFile)
  if (!key) {
    console.error('No API key. Set OPENROUTER_API_KEY, or pass --key-file <file holding the key, or JSON with openrouterApiKey>.')
    process.exitCode = 1
    return
  }
  console.log(`Asking ${opts.model}…`)
  const response = await callModel({ key, model: opts.model, prompt: pack.text })
  const text = response?.choices?.[0]?.message?.content ?? ''
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const parsed = extractJson(text)
  if (!parsed) {
    console.log('\nThe reviewer did not answer with JSON. Raw reply:\n')
    console.log(text || '(empty)')
    // The call was paid for, so keep it out of scrollback.
    mkdirSync(OUT_DIR, { recursive: true })
    const rawFile = join(OUT_DIR, `${stamp}.raw.txt`)
    writeFileSync(rawFile, text || '')
    console.log(`\nSaved the raw reply to ${rawFile}`)
    return
  }
  const review = normalizeReview(parsed)
  printReview(review, { model: response?.model ?? opts.model, usage: response?.usage })

  mkdirSync(OUT_DIR, { recursive: true })
  const file = join(OUT_DIR, `${stamp}.json`)
  writeFileSync(file, JSON.stringify({ base: pack.base, model: response?.model ?? opts.model, usage: response?.usage ?? null, ...review }, null, 2))
  console.log(`\nSaved to ${file}`)
}

// Only run when invoked directly, so the helpers above can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('peer-review.mjs')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
