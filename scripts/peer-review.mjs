#!/usr/bin/env node
/**
 * Peer review: send the uncommitted change to a model from another family and print what it finds.
 *
 * A development tool, deliberately outside whatever the repo builds: Node 18+ and nothing else (no package.json, no
 * install, no build step), so it can be copied into a repo in any language.
 *
 * `node scripts/peer-review.mjs --help` lists the flags and their defaults (`USAGE` below is that list).
 *
 * The OpenRouter key comes from OPENROUTER_API_KEY, or from --key-file: a file holding the key alone, JSON with an
 * `openrouterApiKey` field, or a `.env`-style `OPENROUTER_API_KEY=` line. Findings are advisory: check every one
 * against the code and give it a verdict.
 *
 * The reply is streamed, so a reviewer that thinks for many minutes never leaves the connection idle (an idle request
 * gets dropped on the way), and a progress line prints every minute while it works. A failure the owner must fix (no
 * key, a rejected key, no credits, a refusal) exits 2 at once; a stall, an error partway or a transient status is
 * tried up to twice more, skipping the provider that failed.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const FALLBACK_MODEL = 'xiaomi/mimo-v2.6-pro'
const DEFAULT_MODEL = process.env.PEER_REVIEW_MODEL ?? FALLBACK_MODEL
/** Sent on every call: some models, MiMo among them, only think when asked (`enabled` alone means medium). */
const DEFAULT_EFFORT = 'max'
/** OpenRouter's reasoning levels; it maps one a model lacks to the nearest it has. */
const EFFORTS = new Set(['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'])
const TIMEOUT_MS = 30 * 60 * 1000
/** Nothing at all from OpenRouter for this long (it sends keep-alive comments while a model thinks) means the call is dead. */
const IDLE_MS = 5 * 60 * 1000
const PROGRESS_MS = 60 * 1000
const MAX_ATTEMPTS = 3
/** Waits before the second and third attempts when OpenRouter sends no Retry-After; one it sends is capped at 60 s. */
const RETRY_WAITS_MS = [5000, 20000]
const MAX_RETRY_AFTER_S = 60
const OUT_DIR = '.peer-review'
const DEFAULT_MAX_FILE_KB = 120
const DEFAULT_MAX_TOKENS = 400000

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
  const maxBytes = (opts.maxFileKb ?? DEFAULT_MAX_FILE_KB) * 1024
  const name = path.split('/').pop() ?? path
  if (sizeBytes === null) return { include: false, reason: 'deleted' }
  if (opts.ignored) return { include: false, reason: 'git-ignored' }
  if (LOCKFILES.has(name)) return { include: false, reason: 'lockfile' }
  if (BINARY_EXT.test(path)) return { include: false, reason: 'binary' }
  if (sizeBytes > maxBytes) return { include: false, reason: `${Math.round(sizeBytes / 1024)} KB over the ${opts.maxFileKb ?? DEFAULT_MAX_FILE_KB} KB cap`, oversize: true }
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

const VALUE_FLAGS = new Set(['--base', '--model', '--effort', '--focus', '--max-file-kb', '--max-tokens', '--key-file'])

/** The one list of flags, printed by --help and after an unknown argument. One line per flag, with its default. */
export const USAGE = [
  'usage: node scripts/peer-review.mjs [flags]   reviews the working tree (everything, before a first commit)',
  '  --base <ref>         diff against this ref instead, e.g. main to review a branch (default HEAD)',
  `  --model <id>         the OpenRouter model that reviews (default $PEER_REVIEW_MODEL, else ${FALLBACK_MODEL})`,
  `  --effort <level>     how hard the reviewer thinks: ${[...EFFORTS].join(', ')} (default ${DEFAULT_EFFORT})`,
  '  --focus "<text>"     what the change is and where to look, sent with the diff (default none)',
  `  --max-file-kb <n>    leave out a file bigger than this, and its diff unless the diff fits (default ${DEFAULT_MAX_FILE_KB})`,
  `  --max-tokens <n>     refuse to send a pack bigger than this many estimated tokens (default ${DEFAULT_MAX_TOKENS})`,
  '  --key-file <path>    the key alone, JSON with openrouterApiKey, or an OPENROUTER_API_KEY= line; used only when',
  '                       OPENROUTER_API_KEY is unset (default none)',
  '  --dry-run            print the pack size and file list, call nothing (default off)',
  '  --help, -h           print this list'
].join('\n')

/**
 * Both `--flag value` and `--flag=value` are accepted. Anything unrecognised, and any value flag left without a
 * value, lands in `unknown` rather than being dropped: a typo must not quietly review the wrong thing.
 */
export function parseArgs(argv) {
  const out = { base: 'HEAD', model: DEFAULT_MODEL, effort: DEFAULT_EFFORT, focus: '', dryRun: false, maxFileKb: DEFAULT_MAX_FILE_KB, maxTokens: DEFAULT_MAX_TOKENS, keyFile: '', unknown: [] }
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
    else if (flag === '--effort') {
      if (EFFORTS.has(value)) out.effort = value
      else out.unknown.push(`--effort ${value}`)
    }
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

/** Tracked files the base does not have, such as one staged since the last commit: their diff is their full text. */
function addedFiles(base) {
  return git(['diff', '--name-only', '--diff-filter=A', base]).split('\n').filter(Boolean)
}

/**
 * The pathspec for the diff sent to the reviewer: everything but lockfiles, at any depth, and the files in
 * `excluded`. Without it a tracked file's whole diff is sent while the report lists it as skipped.
 */
export function diffPathspec(excluded = []) {
  return [
    '--',
    '.',
    ...[...LOCKFILES].map((name) => `:(exclude,glob)**/${name}`),
    ...excluded.map((path) => `:(exclude,literal)${path}`)
  ]
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
  const changed = changedFiles(base)
  // Against the empty tree every staged file is new too.
  const added = new Set(empty ? changed : addedFiles(base))
  const skipped = []

  // A tracked file over the cap keeps its diff only when the diff itself fits, so a small edit to a big file is
  // still reviewed and the pack never carries what the report says was left out. A new file's diff is its full
  // text, so it never fits.
  const diffExcluded = []
  for (const path of changed) {
    const decision = fileDecision(path, sizeOf(path), { maxFileKb })
    if (!decision.oversize) continue
    const fits = !added.has(path) && git(['diff', base, '--', `:(literal)${path}`]).length <= maxFileKb * 1024
    if (!fits) diffExcluded.push(path)
    skipped.push(`${path} (${decision.reason}; ${fits ? 'its diff is included' : 'its diff is left out too'})`)
  }

  const diff = git(['diff', base, ...diffPathspec(diffExcluded)])
  const untracked = untrackedFiles()
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
  const note = included.length || added.size
    ? '\n\nNew files appear here as all-additions diffs. That diff is their full text, so they are not repeated below.'
    : ''
  parts.push(`## The change (git diff against ${label}, plus new files)${note}\n\n\`\`\`diff\n${fullDiff || '(no changes)'}\n\`\`\``)

  const newFiles = new Set(included)
  const touched = [...new Set([...changed, ...included])]
  const files = []
  let fullInDiff = 0
  for (const path of touched) {
    if (newFiles.has(path)) continue
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
    // A tracked new file's diff already carries its full text.
    if (added.has(path)) {
      fullInDiff++
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

/**
 * A key file holds the key alone, JSON with an `openrouterApiKey` field, or a `.env`-style `OPENROUTER_API_KEY=` line
 * (`export`, quotes and a trailing ` # comment` each optional); the first such line wins.
 */
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
  for (const line of trimmed.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[1].trim()
    const quoted = /^(?:"([^"]*)"|'([^']*)')(?:\s+#.*)?$/.exec(value)
    if (quoted) return quoted[1] ?? quoted[2]
    if (/^["']/.test(value)) return ''
    return value.replace(/(?:^|\s)#.*$/, '').trim()
  }
  return /[\s=]/.test(trimmed) ? '' : trimmed
}

function readKey(keyFile) {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim()
  if (fromEnv) return fromEnv
  if (!keyFile || !existsSync(keyFile)) return ''
  return keyFromFileText(readFileSync(keyFile, 'utf8'))
}

/** Splits streamed text into its complete `data:` payloads and the unfinished last line; comments are dropped. */
export function sseData(text) {
  const lines = text.split('\n')
  const rest = lines.pop()
  const data = lines
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  return { data, rest }
}

/**
 * A failed call: `status` is the HTTP status or the stream's `error.code`, `retryAfter` is in seconds, `inStream` marks
 * an error sent after 200 OK, `stalled` an idle stream and `timedOut` the overall timeout. `detail` is OpenRouter's own
 * message.
 */
export class CallError extends Error {
  constructor(message, { status, provider, retryAfter, metadata, inStream = false, stalled = false, timedOut = false, detail } = {}) {
    super(message)
    this.name = 'CallError'
    Object.assign(this, { status, provider, retryAfter, metadata, inStream, stalled, timedOut, detail })
  }
}

/** Whether a failure needs the owner, is worth another attempt, or is a bug or a dead end; and what to say. */
export function classifyFailure(err) {
  if (!(err instanceof CallError)) {
    const cause = err?.cause?.message ? ` (${err.cause.message})` : ''
    return { kind: 'retry', message: `${err instanceof Error ? err.message : String(err)}${cause}` }
  }
  if (err.timedOut) return { kind: 'fatal', message: err.message }
  // An error sent after 200 OK is a provider failing partway, whatever its code: a real key or credit problem comes back
  // as an HTTP status on the next attempt.
  if (err.stalled || err.inStream) return { kind: 'retry', message: err.message }
  const status = Number.parseInt(err.status, 10)
  if (status === 401) return { kind: 'owner', message: 'OpenRouter rejected the key: check OPENROUTER_API_KEY or --key-file.' }
  if (status === 402 && err.metadata?.limit_source !== 'openrouter_in_flight_budget') {
    return { kind: 'owner', message: 'OpenRouter is out of credits for this account or key: add credits at https://openrouter.ai/settings/credits, then rerun.' }
  }
  if (status === 403) return { kind: 'owner', message: `OpenRouter refused the request: ${err.detail || err.message}.` }
  if (!Number.isInteger(status) || status === 402 || status === 408 || status === 429 || status >= 500) return { kind: 'retry', message: err.message }
  return { kind: 'fatal', message: err.message }
}

/** Folds one streamed chunk into the reply so far; an error sent mid-stream throws. */
export function foldChunk(reply, chunk) {
  const provider = chunk.provider ?? reply.provider
  if (chunk.error) {
    const detail = chunk.error.message ?? JSON.stringify(chunk.error)
    const named = chunk.provider ?? chunk.error.metadata?.provider_name ?? reply.provider
    throw new CallError(`OpenRouter: ${detail}`, { status: chunk.error.code, metadata: chunk.error.metadata, provider: named, inStream: true, detail })
  }
  const choice = chunk.choices?.[0] ?? {}
  const delta = choice.delta ?? {}
  const content = typeof delta.content === 'string' ? delta.content : ''
  const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning : ''
  return {
    model: chunk.model ?? reply.model,
    provider,
    usage: chunk.usage ?? reply.usage,
    finishReason: choice.finish_reason ?? reply.finishReason,
    nativeFinishReason: choice.native_finish_reason ?? reply.nativeFinishReason,
    content: reply.content + content,
    received: reply.received + content.length + reasoning.length
  }
}

/** Reads the streamed reply into the shape a plain completion has, saying every minute how far it has got. */
export async function readStream(res, abort, idleMs = IDLE_MS) {
  const started = Date.now()
  let lastNote = started
  let reply = { model: undefined, provider: undefined, usage: undefined, finishReason: undefined, nativeFinishReason: undefined, content: '', received: 0 }
  let tail = ''
  let idle
  const stillAlive = () => {
    clearTimeout(idle)
    idle = setTimeout(() => abort(new CallError(`no data from OpenRouter for ${idleMs / 60000} minutes`, { stalled: true, provider: reply.provider })), idleMs)
  }
  const decoder = new TextDecoder()
  // Folds the complete lines of `text` into the reply and returns the unfinished last one. At the end of the
  // stream a payload cut mid-line is dropped, not thrown: the reply's content may already be whole.
  const fold = (text, last = false) => {
    const { data, rest } = sseData(text)
    for (const payload of data) {
      if (payload === '[DONE]') continue
      let chunk
      try {
        chunk = JSON.parse(payload)
      } catch (err) {
        if (last) continue
        throw err
      }
      reply = foldChunk(reply, chunk)
    }
    return rest
  }
  stillAlive()
  try {
    for await (const bytes of res.body) {
      stillAlive()
      tail = fold(tail + decoder.decode(bytes, { stream: true }))
      if (Date.now() - lastNote >= PROGRESS_MS) {
        lastNote = Date.now()
        const minutes = Math.round((lastNote - started) / 60000)
        console.log(`  still working: ${minutes} min, ${reply.received.toLocaleString()} characters so far`)
      }
    }
    fold(tail + decoder.decode() + '\n', true)
  } catch (err) {
    // Any failure partway, a dropped connection included, names the provider that was streaming.
    if (err && typeof err === 'object') err.provider ??= reply.provider
    throw err
  } finally {
    clearTimeout(idle)
  }
  const choice = { message: { content: reply.content }, finish_reason: reply.finishReason, native_finish_reason: reply.nativeFinishReason }
  return { model: reply.model, provider: reply.provider, usage: reply.usage, choices: [choice] }
}

/** The request OpenRouter is sent: a streamed JSON reply, its usage, how hard to think, and providers to skip. */
export function requestBody({ model, prompt, effort = DEFAULT_EFFORT, ignore = [] }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    reasoning: { effort },
    stream: true,
    usage: { include: true }
  }
  if (ignore.length) body.provider = { ignore }
  return body
}

/** A warning when a reviewer asked to think reports that it did not, or does not say; '' when it reasoned. */
export function reasoningNote(usage, effort) {
  const tokens = usage?.completion_tokens_details?.reasoning_tokens
  if (effort === 'none' || tokens > 0) return ''
  if (typeof tokens !== 'number') return 'The reply did not say whether the reviewer reasoned, so this run cannot show that it did.'
  return (
    'The reviewer did not reason (0 reasoning tokens): treat this run as no review, and run it again. ' +
    'A model that cannot reason always reports 0; pass --effort none for it.'
  )
}

/** A non-ok response as a CallError, with OpenRouter's `error` and `Retry-After` read when it sends them. */
async function statusError(res) {
  const text = await res.text().catch(() => '')
  let error
  try {
    error = JSON.parse(text)?.error
  } catch {
    /* not JSON */
  }
  const detail = typeof error?.message === 'string' ? error.message : text.slice(0, 300)
  // Retry-After is seconds or an HTTP date.
  const header = res.headers?.get?.('retry-after')
  const retryAfter = !header ? NaN : /^\d+$/.test(header.trim()) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000)
  return new CallError(`OpenRouter ${res.status}: ${detail}`, {
    status: res.status,
    metadata: error?.metadata,
    provider: error?.metadata?.provider_name,
    retryAfter: Number.isFinite(retryAfter) ? Math.max(retryAfter, 0) : undefined,
    detail
  })
}

/**
 * Up to MAX_ATTEMPTS calls. A failure the owner must fix, or one another attempt cannot fix, throws at once with its
 * `kind`; any other retries, skipping the provider that failed when it is known.
 */
export async function callModel({ key, model, prompt, effort, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), idleMs = IDLE_MS }) {
  const ignore = []
  let last
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const body = JSON.stringify(requestBody({ model, prompt, effort, ignore }))
    const controller = new AbortController()
    const abort = (reason) => controller.abort(reason)
    const overall = setTimeout(() => abort(new CallError(`no complete reply in ${TIMEOUT_MS / 60000} minutes`, { timedOut: true })), TIMEOUT_MS)
    // Until the stream starts, readStream's watchdog is not running: a hang here is a stall too.
    const waiting = setTimeout(() => abort(new CallError(`no response from OpenRouter for ${idleMs / 60000} minutes`, { stalled: true })), idleMs)
    let failure
    try {
      const res = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'peer-review' },
        body,
        signal: controller.signal
      })
      if (res.ok) {
        clearTimeout(waiting)
        return await readStream(res, abort, idleMs)
      }
      failure = await statusError(res)
      // statusError reads the body quietly, so a timeout that cut it short shows only here.
      if (controller.signal.aborted && controller.signal.reason) failure = controller.signal.reason
    } catch (err) {
      // Our own abort reason is the failure, even if the runtime wraps it.
      failure = controller.signal.aborted && controller.signal.reason ? controller.signal.reason : err
      if (failure !== err && failure && typeof failure === 'object') failure.provider ??= err?.provider
    } finally {
      clearTimeout(waiting)
      clearTimeout(overall)
    }
    // Skipping every provider leaves OpenRouter none to route to, so the attempt left goes to all of them again.
    if (failure?.metadata?.failed_routing_step === 'Filter by Ignored Providers' && ignore.length && attempt < MAX_ATTEMPTS) {
      console.log(`  every provider has been skipped; retrying with all of them (attempt ${attempt + 1} of ${MAX_ATTEMPTS})…`)
      ignore.length = 0
      continue
    }
    last = classifyFailure(failure)
    if (last.kind !== 'retry') throw Object.assign(new Error(last.message), { kind: last.kind })
    if (attempt === MAX_ATTEMPTS) break
    const provider = failure?.provider
    if (provider && !ignore.includes(provider)) ignore.push(provider)
    const retryAfter = failure?.retryAfter
    const wait = typeof retryAfter === 'number' ? Math.min(retryAfter, MAX_RETRY_AFTER_S) * 1000 : RETRY_WAITS_MS[attempt - 1]
    console.log(`  ${last.message}; retrying (attempt ${attempt + 1} of ${MAX_ATTEMPTS})${provider ? `, skipping ${provider}` : ''}…`)
    await sleep(wait)
  }
  throw Object.assign(new Error(`Gave up after ${MAX_ATTEMPTS} attempts: ${last.message}\nRun it again; if it gives up again, tell the owner.`), { kind: 'retry' })
}

/** 2 when OpenRouter needs the owner (credits, the key, or a refusal), 1 for any other failure. */
export function exitCode(err) {
  return err?.kind === 'owner' ? 2 : 1
}

/** Who answered, through which provider, why it stopped, and what it cost: the parts not known are left out. */
export function replyLines({ model, provider, finishReason, nativeFinishReason, usage }) {
  const via = provider ? ` via ${provider}` : ''
  const native = nativeFinishReason && nativeFinishReason !== finishReason ? ` (${nativeFinishReason})` : ''
  const finished = finishReason ? ` · finished: ${finishReason}${native}` : ''
  const lines = [`Reviewer: ${model}${via}${finished}`]
  if (usage) {
    const cost = typeof usage.cost === 'number' ? ` · $${usage.cost.toFixed(4)}` : ''
    lines.push(`Tokens: ${usage.prompt_tokens ?? '?'} in, ${usage.completion_tokens ?? '?'} out${cost}`)
  }
  return lines
}

function printReview(review, meta) {
  console.log('')
  for (const line of replyLines(meta)) console.log(line)
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
    console.error('No API key. Set OPENROUTER_API_KEY, or pass --key-file <file holding the key, JSON with openrouterApiKey, or an OPENROUTER_API_KEY= line>.')
    process.exitCode = exitCode({ kind: 'owner' })
    return
  }
  console.log(`Asking ${opts.model}…`)
  const response = await callModel({ key, model: opts.model, prompt: pack.text, effort: opts.effort })
  const note = reasoningNote(response?.usage, opts.effort)
  const text = response?.choices?.[0]?.message?.content ?? ''
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const meta = {
    model: response?.model ?? opts.model,
    provider: response?.provider,
    finishReason: response?.choices?.[0]?.finish_reason,
    nativeFinishReason: response?.choices?.[0]?.native_finish_reason,
    usage: response?.usage
  }
  const { model, provider, finishReason, nativeFinishReason, usage } = meta
  const parsed = extractJson(text)
  // The schema SYSTEM asks for requires a findings array; JSON without one, or whose findings all fail to
  // normalize, is no review.
  const review = Array.isArray(parsed?.findings) ? normalizeReview(parsed) : null
  if (!review || (parsed.findings.length > 0 && review.findings.length === 0)) {
    console.log('\nNo review: the reply was not the JSON review asked for. Raw reply:\n')
    console.log(text || '(empty)')
    console.log('')
    for (const line of replyLines(meta)) console.log(line)
    if (note) console.log(`\n${note}`)
    // The call was paid for, so keep it out of scrollback.
    mkdirSync(OUT_DIR, { recursive: true })
    const rawFile = join(OUT_DIR, `${stamp}.raw.json`)
    writeFileSync(rawFile, JSON.stringify({ base: pack.base, model, provider, finishReason, nativeFinishReason, effort: opts.effort, usage: usage ?? null, reply: text }, null, 2))
    console.log(`\nSaved the raw reply to ${rawFile}`)
    console.log('Run it again; if it happens again, tell the owner.')
    process.exitCode = 1
    return
  }
  printReview(review, meta)
  if (note) console.log(`\n${note}`)

  mkdirSync(OUT_DIR, { recursive: true })
  const file = join(OUT_DIR, `${stamp}.json`)
  writeFileSync(file, JSON.stringify({ base: pack.base, model, provider, finishReason, nativeFinishReason, effort: opts.effort, usage: usage ?? null, ...review }, null, 2))
  console.log(`\nSaved to ${file}`)
}

// Only run when invoked directly, so the helpers above can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('peer-review.mjs')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = exitCode(err)
  })
}
