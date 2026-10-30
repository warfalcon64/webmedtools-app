// Run with: node --test scripts/peer-review.test.mjs (Node 18+, nothing to install)
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPack,
  CallError,
  callModel,
  classifyFailure,
  exitCode,
  estimateTokens,
  extractJson,
  fileDecision,
  foldChunk,
  keyFromFileText,
  looksBinary,
  normalizeReview,
  parseArgs,
  readStream,
  reasoningNote,
  replyLines,
  requestBody,
  sseData,
  USAGE
} from './peer-review.mjs'

/** The keys of `expected` match in `actual`; anything else in `actual` is ignored. */
function assertSubset(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `key "${key}"`)
}

/** Run `fn` inside a fresh git repo with no commits, then clean up whatever happens. */
function inFreshRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'peer-review-test-'))
  const cwd = process.cwd()
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' })
    process.chdir(dir)
    fn(dir)
  } finally {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('extractJson', () => {
  it('reads plain JSON, fenced JSON and JSON buried in prose', () => {
    assert.deepEqual(extractJson('{"summary":"ok","findings":[]}'), { summary: 'ok', findings: [] })
    assert.deepEqual(extractJson('```json\n{"summary":"ok"}\n```'), { summary: 'ok' })
    assert.deepEqual(extractJson('Here you go:\n{"summary":"ok"}\nHope that helps.'), { summary: 'ok' })
  })

  it('returns null rather than throwing on junk', () => {
    assert.equal(extractJson('no json here'), null)
    assert.equal(extractJson(''), null)
    assert.equal(extractJson(undefined), null)
  })
})

describe('normalizeReview', () => {
  it('sorts worst first, fills defaults and drops empty findings', () => {
    const r = normalizeReview({
      summary: '  two problems  ',
      findings: [
        { file: 'a.ts', severity: 'low', claim: 'small' },
        { file: 'b.ts', line: 12, severity: 'high', claim: 'big', scenario: 'on retry', confidence: 2 },
        { claim: '' },
        'nonsense'
      ]
    })
    assert.equal(r.summary, 'two problems')
    assert.deepEqual(
      r.findings.map((f) => f.severity),
      ['high', 'low']
    )
    assertSubset(r.findings[0], { file: 'b.ts', line: 12, confidence: 1 })
    assert.equal(r.findings[1].line, null)
  })

  it('survives a reply with no findings at all', () => {
    assert.deepEqual(normalizeReview({ summary: 'looks fine' }).findings, [])
    assert.deepEqual(normalizeReview(null), { summary: '', findings: [] })
  })
})

describe('fileDecision', () => {
  it('keeps ordinary source files and explains every skip', () => {
    assert.deepEqual(fileDecision('src/main/index.ts', 4000), { include: true, reason: '' })
    assert.equal(fileDecision('package-lock.json', 4000).reason, 'lockfile')
    assert.equal(fileDecision('go.sum', 4000).reason, 'lockfile')
    assert.equal(fileDecision('app/Gemfile.lock', 4000).reason, 'lockfile')
    assert.equal(fileDecision('docs/shot.png', 4000).reason, 'binary')
    assert.equal(fileDecision('src/gone.ts', null).reason, 'deleted')
    assert.equal(fileDecision('data/settings.json', 10, { ignored: true }).reason, 'git-ignored')
    assert.match(fileDecision('src/big.ts', 200 * 1024, { maxFileKb: 120 }).reason, /over the 120 KB cap/)
    assert.equal(fileDecision('src/big.ts', 200 * 1024, { maxFileKb: 500 }).include, true)
  })
})

describe('cli helpers', () => {
  it('defaults to the working tree and reads every flag', () => {
    assertSubset(parseArgs([]), { base: 'HEAD', dryRun: false, maxFileKb: 120, maxTokens: 400000, unknown: [] })
    assertSubset(
      parseArgs(['--base', 'main', '--model', 'x/y', '--focus', 'undo', '--dry-run', '--max-file-kb', '40', '--max-tokens', '50000']),
      { base: 'main', model: 'x/y', focus: 'undo', dryRun: true, maxFileKb: 40, maxTokens: 50000, unknown: [] }
    )
  })

  it('asks for max reasoning unless --effort names another level', () => {
    assertSubset(parseArgs([]), { effort: 'max' })
    assertSubset(parseArgs(['--effort', 'high']), { effort: 'high', unknown: [] })
    assertSubset(parseArgs(['--effort=low']), { effort: 'low', unknown: [] })
    assertSubset(parseArgs(['--effort', 'maximum']), { effort: 'max', unknown: ['--effort maximum'] })
  })

  it('accepts the --flag=value form', () => {
    assertSubset(parseArgs(['--base=main', '--max-tokens=1000', '--focus=the reducer']), {
      base: 'main',
      maxTokens: 1000,
      focus: 'the reducer',
      unknown: []
    })
  })

  it('reports an unknown flag and a flag with no value instead of dropping it', () => {
    assert.deepEqual(parseArgs(['--bogus']).unknown, ['--bogus'])
    assert.deepEqual(parseArgs(['--dry-run=yes']).unknown, ['--dry-run=yes'])
    assert.deepEqual(parseArgs(['--base']).unknown, ['--base (missing value)'])
    assert.equal(parseArgs(['--base']).base, 'HEAD')
  })

  it('lists in USAGE every flag parseArgs reads, and parses every flag USAGE lists', () => {
    const source = readFileSync(new URL('./peer-review.mjs', import.meta.url), 'utf8')
    const read = new Set([...source.matchAll(/flag === '(--[a-z-]+)'/g)].map((m) => m[1]))
    const listed = new Set([...USAGE.matchAll(/^\s+(--[a-z-]+)/gm)].map((m) => m[1]))
    assert.ok(read.size >= 9, `found only ${[...read]}`)
    assert.deepEqual([...read].sort(), [...listed].sort())
    for (const line of USAGE.split('\n').filter((l) => /^\s+--/.test(l))) {
      const [, flag, value] = /^\s+(--[a-z-]+)(?: (\S+))?/.exec(line)
      const argv = value ? [flag, flag === '--effort' ? 'high' : '1'] : [flag]
      assert.deepEqual(parseArgs(argv).unknown, [], line)
    }
    assert.match(USAGE, /--help, -h/)
    assertSubset(parseArgs(['-h']), { help: true, unknown: [] })
  })

  it('keeps the default when a numeric flag is not a number', () => {
    assertSubset(parseArgs(['--max-tokens', 'lots']), { maxTokens: 400000, unknown: [] })
  })

  it('counts binaries and tokens', () => {
    assert.equal(looksBinary('plain text'), false)
    assert.equal(looksBinary('bad\u0000byte'), true)
    assert.equal(estimateTokens('a'.repeat(400)), 100)
  })
})

describe('keyFromFileText', () => {
  it('reads a bare key or a JSON field, and nothing else', () => {
    assert.equal(keyFromFileText('sk-or-abc\n'), 'sk-or-abc')
    assert.equal(keyFromFileText('{"openrouterApiKey": " sk-or-abc "}'), 'sk-or-abc')
    assert.equal(keyFromFileText('{"other": 1}'), '')
    assert.equal(keyFromFileText('{not json'), '')
    assert.equal(keyFromFileText('two words'), '')
    assert.equal(keyFromFileText(''), '')
  })

  it('reads an OPENROUTER_API_KEY line from a .env-style file', () => {
    assert.equal(keyFromFileText('OPENROUTER_API_KEY = sk-or-abc\n'), 'sk-or-abc')
    assert.equal(keyFromFileText('export OPENROUTER_API_KEY="sk-or-abc"'), 'sk-or-abc')
    assert.equal(keyFromFileText("OPENROUTER_API_KEY='sk-or-abc'"), 'sk-or-abc')
    assert.equal(keyFromFileText('# keys\r\nOTHER_KEY=1\r\nOPENROUTER_API_KEY=sk-or-abc\r\n'), 'sk-or-abc')
    assert.equal(keyFromFileText('OPENROUTER_API_KEY=sk-or-abc # note'), 'sk-or-abc')
    assert.equal(keyFromFileText('OPENROUTER_API_KEY="sk-or-abc" # note'), 'sk-or-abc')
    assert.equal(keyFromFileText('OPENROUTER_API_KEY='), '')
    assert.equal(keyFromFileText('OPENROUTER_API_KEY= # set me'), '')
    assert.equal(keyFromFileText('OPENROUTER_API_KEY="sk-or-abc'), '')
    assert.equal(keyFromFileText('OPENROUTER_API_KEY="sk-or-abc" "sk-or-xyz"'), '')
    assert.equal(keyFromFileText('OTHER=x'), '')
  })
})

describe('buildPack', () => {
  it('reviews everything in a repo with no commits yet', () => {
    inFreshRepo((dir) => {
      writeFileSync(join(dir, 'a.txt'), 'hello\n')
      writeFileSync(join(dir, 'staged.txt'), 'added before the first commit\n')
      execFileSync('git', ['add', 'staged.txt'], { stdio: 'ignore' })
      const pack = buildPack({ base: 'HEAD', maxFileKb: 120, focus: '' })
      assert.equal(pack.base, 'the empty tree (no commits yet)')
      assert.deepEqual([...pack.touched].sort(), ['a.txt', 'staged.txt'])
      assert.equal(pack.hasChanges, true)
      assert.equal(pack.fileCount, 2)
      assert.match(pack.text, /\+hello/)
      assert.match(pack.text, /\+added before the first commit/)
      // Each file's text is sent once, as its diff, not again as a pre-existing file.
      assert.equal(pack.text.split('added before the first commit').length - 1, 1)
      assert.doesNotMatch(pack.text, /that already existed/)
    })
  })

  it('leaves a tracked lockfile out of the diff it reports as skipped', () => {
    inFreshRepo((dir) => {
      mkdirSync(join(dir, 'web'))
      writeFileSync(join(dir, 'a.txt'), 'one\n')
      writeFileSync(join(dir, 'package-lock.json'), '{"lockfileVersion": 3}\n')
      writeFileSync(join(dir, 'web', 'yarn.lock'), 'old-nested-lock\n')
      execFileSync('git', ['add', '.'], { stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], { stdio: 'ignore' })
      writeFileSync(join(dir, 'a.txt'), 'two\n')
      writeFileSync(join(dir, 'package-lock.json'), '{"lockfileVersion": 3, "changed": "root-lock"}\n')
      writeFileSync(join(dir, 'web', 'yarn.lock'), 'new-nested-lock\n')
      const pack = buildPack({ base: 'HEAD', maxFileKb: 120, focus: '' })
      assert.match(pack.text, /\+two/)
      assert.doesNotMatch(pack.text, /root-lock/)
      assert.doesNotMatch(pack.text, /nested-lock/)
      assert.ok(pack.skipped.includes('package-lock.json (lockfile)'))
      assert.ok(pack.skipped.includes('web/yarn.lock (lockfile)'))
    })
  })

  it('sends a file staged since the last commit once, as its diff', () => {
    inFreshRepo((dir) => {
      writeFileSync(join(dir, 'a.txt'), 'one\n')
      execFileSync('git', ['add', '.'], { stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], { stdio: 'ignore' })
      writeFileSync(join(dir, 'staged.txt'), 'staged after the first commit\n')
      writeFileSync(join(dir, 'nul.txt'), 'a\u0000b')
      execFileSync('git', ['add', 'staged.txt', 'nul.txt'], { stdio: 'ignore' })
      const pack = buildPack({ base: 'HEAD', maxFileKb: 120, focus: '' })
      assert.deepEqual([...pack.touched].sort(), ['nul.txt', 'staged.txt'])
      assert.deepEqual(pack.skipped, ['nul.txt (binary)'])
      assert.equal(pack.fileCount, 1)
      assert.equal(pack.text.split('staged after the first commit').length - 1, 1)
      assert.doesNotMatch(pack.text, /that already existed/)
    })
  })

  it('keeps an oversized file out of the diff unless the diff itself fits', () => {
    inFreshRepo((dir) => {
      const big = (tag) => `${tag}\n${'x'.repeat(80)}\n`.repeat(40)
      writeFileSync(join(dir, 'small-edit.txt'), big('keep'))
      writeFileSync(join(dir, 'rewritten.txt'), big('old'))
      execFileSync('git', ['add', '.'], { stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], { stdio: 'ignore' })
      writeFileSync(join(dir, 'small-edit.txt'), `one-line-edit\n${big('keep')}`)
      writeFileSync(join(dir, 'rewritten.txt'), big('rewritten-line'))
      writeFileSync(join(dir, 'staged-big.txt'), big('staged-big-line'))
      execFileSync('git', ['add', 'staged-big.txt'], { stdio: 'ignore' })
      const pack = buildPack({ base: 'HEAD', maxFileKb: 1, focus: '' })
      assert.match(pack.text, /\+one-line-edit/)
      assert.doesNotMatch(pack.text, /rewritten-line/)
      assert.doesNotMatch(pack.text, /staged-big-line/)
      assert.ok(pack.skipped.some((s) => s.startsWith('small-edit.txt (') && s.endsWith('its diff is included)')))
      assert.ok(pack.skipped.some((s) => s.startsWith('rewritten.txt (') && s.endsWith('its diff is left out too)')))
      assert.ok(pack.skipped.some((s) => s.startsWith('staged-big.txt (') && s.endsWith('its diff is left out too)')))
      assert.equal(pack.skipped.length, 3)
      assert.equal(pack.fileCount, 0)
    })
  })

  it('still refuses a base that does not exist', () => {
    inFreshRepo(() => {
      assert.throws(() => buildPack({ base: 'no-such-branch', maxFileKb: 120, focus: '' }), /Unknown base "no-such-branch"/)
    })
  })
})

describe('reasoning', () => {
  it('asks for the effort in a streamed JSON request', () => {
    assertSubset(requestBody({ model: 'x/y', prompt: 'p', effort: 'high' }), {
      model: 'x/y',
      reasoning: { effort: 'high' },
      response_format: { type: 'json_object' },
      stream: true,
      usage: { include: true }
    })
  })

  it('asks for max when no effort is passed on', () => {
    assertSubset(requestBody({ model: 'x/y', prompt: 'p' }), { reasoning: { effort: 'max' } })
  })

  it('warns when a reviewer asked to reason reports no reasoning tokens, or does not say', () => {
    const usage = (reasoning_tokens) => ({ completion_tokens_details: { reasoning_tokens } })
    assert.match(reasoningNote(usage(0), 'max'), /did not reason.*--effort none/)
    assert.equal(reasoningNote(usage(18882), 'max'), '')
    assert.match(reasoningNote({ completion_tokens: 60 }, 'max'), /did not say/)
    assert.match(reasoningNote(undefined, 'max'), /did not say/)
    assert.equal(reasoningNote(usage(0), 'none'), '')
    assert.equal(reasoningNote(undefined, 'none'), '')
  })
})

describe('streamed reply', () => {
  it('keeps complete data lines and holds back the unfinished one', () => {
    const { data, rest } = sseData(': OPENROUTER PROCESSING\n\ndata: {"a":1}\r\ndata: [DONE]\ndata: {"b"')
    assert.deepEqual(data, ['{"a":1}', '[DONE]'])
    assert.equal(rest, 'data: {"b"')
  })

  it('folds content, reasoning, model and usage', () => {
    let reply = { model: undefined, usage: undefined, content: '', received: 0 }
    reply = foldChunk(reply, { model: 'm', choices: [{ delta: { reasoning: 'hmm' } }] })
    reply = foldChunk(reply, { choices: [{ delta: { content: '{"summary"' } }] })
    reply = foldChunk(reply, { choices: [{ delta: { content: ':"ok"}' } }], usage: { prompt_tokens: 5, cost: 0.1 } })
    assertSubset(reply, { model: 'm', content: '{"summary":"ok"}', received: 19, usage: { prompt_tokens: 5, cost: 0.1 } })
  })

  it('keeps the finish reasons when a later chunk has none', () => {
    let reply = { content: '', received: 0 }
    reply = foldChunk(reply, { choices: [{ delta: { content: '' }, finish_reason: 'length', native_finish_reason: 'max_tokens' }] })
    reply = foldChunk(reply, { choices: [], usage: { prompt_tokens: 5 } })
    assertSubset(reply, { finishReason: 'length', nativeFinishReason: 'max_tokens' })
  })

  it('throws on an error sent mid-stream', () => {
    assert.throws(() => foldChunk({ content: '', received: 0 }, { error: { message: 'provider died' } }), /provider died/)
  })

  /** What readStream makes of a body sent as these chunks (strings, or byte arrays to split a character). */
  async function streamed(...chunks) {
    return (await streamedReply(...chunks)).choices[0].message.content
  }
  /** The whole completion readStream builds from these chunks. */
  async function streamedReply(...chunks) {
    const body = (async function* () {
      for (const chunk of chunks) yield typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    })()
    return readStream({ body }, () => assert.fail('aborted'))
  }
  const delta = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`

  it('keeps a last data line that no newline follows', async () => {
    assert.equal(await streamed(`${delta('{"a"')}\n\n`, delta(':1}')), '{"a":1}')
  })

  it('keeps a character split across the last two chunks', async () => {
    const bytes = new TextEncoder().encode(delta('é'))
    const cut = bytes.indexOf(0xc3) + 1
    assert.equal(await streamed(bytes.slice(0, cut), bytes.slice(cut)), 'é')
  })

  it('drops a last payload cut mid-line and keeps what came before', async () => {
    assert.equal(await streamed(`${delta('{"a":1}')}\n\n`, 'data: {"usage":{"prom'), '{"a":1}')
  })

  it('skips a last [DONE] that no newline follows', async () => {
    assert.equal(await streamed(`${delta('ok')}\n\n`, 'data: [DONE]'), 'ok')
  })

  it('still throws on an error sent as the last line', async () => {
    await assert.rejects(streamed(`${delta('{"a"')}\n\n`, 'data: {"error":{"message":"provider died"}}'), /provider died/)
  })

  it('returns the finish reasons and the provider', async () => {
    const last = { provider: 'P', choices: [{ delta: { content: '' }, finish_reason: 'stop', native_finish_reason: 'end_turn' }] }
    const reply = await streamedReply(`${delta('ok')}\n\n`, `data: ${JSON.stringify(last)}\n\n`)
    assertSubset(reply, { provider: 'P' })
    assertSubset(reply.choices[0], { finish_reason: 'stop', native_finish_reason: 'end_turn' })
  })

  it('names the reviewer, and the provider, finish reasons and cost only when known', () => {
    assert.deepEqual(replyLines({ model: 'm' }), ['Reviewer: m'])
    assert.deepEqual(replyLines({ model: 'm', provider: 'P', finishReason: 'stop', nativeFinishReason: 'stop' }), ['Reviewer: m via P · finished: stop'])
    assert.deepEqual(
      replyLines({ model: 'm', finishReason: 'length', nativeFinishReason: 'max_tokens', usage: { prompt_tokens: 5, completion_tokens: 7, cost: 0.12345 } }),
      ['Reviewer: m · finished: length (max_tokens)', 'Tokens: 5 in, 7 out · $0.1235']
    )
    assert.deepEqual(replyLines({ model: 'm', usage: { prompt_tokens: 5 } }), ['Reviewer: m', 'Tokens: 5 in, ? out'])
  })
})

describe('failures', () => {
  it('sorts each failure into owner, retry or fatal', () => {
    const http = (status, opts = {}) => new CallError(`OpenRouter ${status}: x`, { status, detail: 'x', ...opts })
    const cases = [
      [http(401), 'owner', /rejected the key/],
      [http(402), 'owner', /out of credits.*settings\/credits/],
      [http(402, { metadata: { limit_source: 'openrouter_in_flight_budget' } }), 'retry'],
      [http(403, { detail: 'flagged' }), 'owner', /refused the request: flagged/],
      [http(403, { detail: '' }), 'owner', /refused the request: OpenRouter 403/],
      [http(400), 'fatal'],
      [http(408), 'retry'],
      [http(429), 'retry'],
      [http(500), 'retry'],
      [http(502), 'retry'],
      [http(503), 'retry'],
      [http(504), 'retry'],
      [new CallError('no data', { stalled: true }), 'retry'],
      [new CallError('OpenRouter: died'), 'retry'],
      [new CallError('OpenRouter: died', { status: null }), 'retry'],
      [new CallError('OpenRouter: upstream auth failed', { status: 401, inStream: true }), 'retry'],
      [new TypeError('fetch failed'), 'retry'],
      [new CallError('no complete reply in 30 minutes', { timedOut: true }), 'fatal']
    ]
    for (const [err, kind, message] of cases) {
      const got = classifyFailure(err)
      assert.equal(got.kind, kind, err.message)
      if (message) assert.match(got.message, message)
    }
  })

  it('keeps the last provider seen and names it in a mid-stream error', () => {
    let reply = { content: '', received: 0 }
    reply = foldChunk(reply, { provider: 'Xiaomi', choices: [{ delta: { content: 'a' } }] })
    reply = foldChunk(reply, { choices: [{ delta: { content: 'b' } }] })
    assert.equal(reply.provider, 'Xiaomi')
    assert.throws(
      () => foldChunk(reply, { error: { code: 502, message: 'provider died' } }),
      (err) => err instanceof CallError && err.status === 502 && err.provider === 'Xiaomi'
    )
  })

  it('marks a stalled stream with the provider of the chunks before it', async () => {
    const controller = new AbortController()
    const body = (async function* () {
      yield new TextEncoder().encode(`data: ${JSON.stringify({ provider: 'GMICloud', choices: [{ delta: { content: 'a' } }] })}\n\n`)
      await new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason)))
    })()
    await assert.rejects(readStream({ body }, (reason) => controller.abort(reason), 20), (err) => {
      return err instanceof CallError && err.stalled && err.provider === 'GMICloud'
    })
  })

  it('names the provider in the stall it reports, whatever error the runtime throws', async () => {
    let reason
    const body = (async function* () {
      yield new TextEncoder().encode(`data: ${JSON.stringify({ provider: 'GMICloud', choices: [{ delta: { content: 'a' } }] })}\n\n`)
      await new Promise((_, reject) => setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 60))
    })()
    await assert.rejects(readStream({ body }, (r) => (reason ??= r), 20))
    assert.ok(reason instanceof CallError && reason.stalled && reason.provider === 'GMICloud')
  })

  it('takes a mid-stream error\'s provider from its metadata when the chunk does not name one', () => {
    assert.throws(
      () => foldChunk({ content: '', received: 0 }, { error: { code: 502, message: 'x', metadata: { provider_name: 'StreamLake' } } }),
      (err) => err.provider === 'StreamLake' && err.inStream
    )
  })

  it('exits 2 only when the owner must act', () => {
    assert.equal(exitCode(Object.assign(new Error('x'), { kind: 'owner' })), 2)
    assert.equal(exitCode(Object.assign(new Error('x'), { kind: 'retry' })), 1)
    assert.equal(exitCode(new Error('x')), 1)
  })

  it('asks to skip providers only when there are some', () => {
    assert.equal('provider' in requestBody({ model: 'x/y', prompt: 'p' }), false)
    assert.equal('provider' in requestBody({ model: 'x/y', prompt: 'p', ignore: [] }), false)
    assert.deepEqual(requestBody({ model: 'x/y', prompt: 'p', ignore: ['Xiaomi'] }).provider, { ignore: ['Xiaomi'] })
  })
})

describe('callModel', () => {
  const ok = () => new Response(`data: ${JSON.stringify({ model: 'm', choices: [{ delta: { content: '{}' } }] })}\n\ndata: [DONE]\n\n`, { status: 200 })
  const fail = (status, headers = {}) => new Response(JSON.stringify({ error: { message: `status ${status}` } }), { status, headers })

  /** Runs callModel against these responses (or functions making them), recording each request body and wait. */
  async function run(...responses) {
    return runWith({}, ...responses)
  }
  async function runWith(opts, ...responses) {
    const bodies = []
    const waits = []
    const fetchImpl = async (url, init) => {
      bodies.push(JSON.parse(init.body))
      const next = responses.shift()
      return typeof next === 'function' ? next(init) : next
    }
    const log = console.log
    console.log = () => {}
    try {
      const result = await callModel({ key: 'k', model: 'x/y', prompt: 'p', effort: 'max', fetchImpl, sleep: async (ms) => waits.push(ms), ...opts })
      return { result, bodies, waits }
    } catch (error) {
      return { error, bodies, waits }
    } finally {
      console.log = log
    }
  }

  it('stops at once for the owner on a 402', async () => {
    const { error, bodies } = await run(fail(402))
    assert.equal(error.kind, 'owner')
    assert.match(error.message, /out of credits/)
    assert.equal(bodies.length, 1)
  })

  it('retries a 503 after its Retry-After', async () => {
    const { result, bodies, waits } = await run(fail(503, { 'Retry-After': '7' }), ok())
    assert.equal(result.choices[0].message.content, '{}')
    assert.equal(bodies.length, 2)
    assert.deepEqual(waits, [7000])
  })

  it('skips a provider that stalled on the next attempt', async () => {
    const stalled = () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        yield new TextEncoder().encode(`data: ${JSON.stringify({ provider: 'DeepInfra', choices: [{ delta: { content: 'a' } }] })}\n\n`)
        throw new CallError('no data from OpenRouter for 5 minutes', { stalled: true })
      })()
    })
    const { result, bodies, waits } = await run(stalled, ok())
    assert.ok(result)
    assert.equal('provider' in bodies[0], false)
    assert.deepEqual(bodies[1].provider, { ignore: ['DeepInfra'] })
    assert.deepEqual(waits, [5000])
  })

  it('skips a stalled provider when the runtime throws its own AbortError', async () => {
    const stalled = (init) => ({
      ok: true,
      status: 200,
      body: (async function* () {
        yield new TextEncoder().encode(`data: ${JSON.stringify({ provider: 'Novita', choices: [{ delta: { content: 'a' } }] })}\n\n`)
        await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      })()
    })
    const { result, bodies } = await runWith({ idleMs: 20 }, stalled, ok())
    assert.ok(result)
    assert.deepEqual(bodies[1].provider, { ignore: ['Novita'] })
  })

  it('skips a provider whose connection dropped partway', async () => {
    const dropped = () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        yield new TextEncoder().encode(`data: ${JSON.stringify({ provider: 'Xiaomi', choices: [{ delta: { content: 'a' } }] })}\n\n`)
        throw new TypeError('terminated')
      })()
    })
    const { result, bodies } = await run(dropped, ok())
    assert.ok(result)
    assert.deepEqual(bodies[1].provider, { ignore: ['Xiaomi'] })
  })

  it('retries a call that hangs before any response', async () => {
    const hung = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const { result, bodies } = await runWith({ idleMs: 20 }, hung, ok())
    assert.ok(result)
    assert.equal(bodies.length, 2)
  })

  it('retries an error whose body hangs as a stall, not by its status', async () => {
    const hungBody = (init) => ({
      ok: false,
      status: 402,
      headers: new Headers(),
      text: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    })
    const { result, bodies, waits } = await runWith({ idleMs: 20 }, hungBody, ok())
    assert.ok(result)
    assert.equal(bodies.length, 2)
    assert.deepEqual(waits, [5000])
  })

  it('caps a long Retry-After at a minute', async () => {
    const { waits } = await run(fail(429, { 'Retry-After': '3600' }), ok())
    assert.deepEqual(waits, [60000])
  })

  it('reads Retry-After as seconds or as a date', async () => {
    const date = new Date(Date.now() + 30000).toUTCString()
    const { waits } = await run(fail(429, { 'Retry-After': date }), ok())
    assert.ok(waits[0] > 25000 && waits[0] <= 31000, String(waits[0]))
  })

  it('asks every provider again once all of them have been skipped', async () => {
    const stalled = () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        yield new TextEncoder().encode(`data: ${JSON.stringify({ provider: 'Solo', choices: [{ delta: { content: 'a' } }] })}\n\n`)
        throw new CallError('no data from OpenRouter for 5 minutes', { stalled: true })
      })()
    })
    const allIgnored = new Response(JSON.stringify({ error: { code: 404, message: 'All providers have been ignored.', metadata: { failed_routing_step: 'Filter by Ignored Providers' } } }), { status: 404 })
    const { result, bodies } = await run(stalled, allIgnored, ok())
    assert.ok(result)
    assert.deepEqual(bodies[1].provider, { ignore: ['Solo'] })
    assert.equal('provider' in bodies[2], false)
  })

  it('gives up after three failures', async () => {
    const { error, bodies, waits } = await run(fail(502), fail(502), fail(502))
    assert.match(error.message, /^Gave up after 3 attempts: OpenRouter 502: status 502/)
    assert.match(error.message, /Run it again; if it gives up again, tell the owner/)
    assert.notEqual(error.kind, 'owner')
    assert.equal(bodies.length, 3)
    assert.deepEqual(waits, [5000, 20000])
  })

  it('does not retry a 400', async () => {
    const { error, bodies } = await run(fail(400))
    assert.equal(error.kind, 'fatal')
    assert.equal(bodies.length, 1)
  })
})

describe('main', () => {
  const script = fileURLToPath(new URL('./peer-review.mjs', import.meta.url))
  // Stands in for OpenRouter: one streamed reply whose content is $STUB_CONTENT.
  const stub = `
const chunks = [
  { provider: 'StubCo', choices: [{ delta: { reasoning: 'thinking' } }] },
  { choices: [{ delta: { content: process.env.STUB_CONTENT } }] },
  { choices: [{ delta: { content: '' }, finish_reason: 'stop', native_finish_reason: 'end_turn' }] },
  { choices: [], usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.5 } }
]
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  body: (async function* () {
    for (const c of chunks) yield new TextEncoder().encode('data: ' + JSON.stringify(c) + '\\n\\n')
    yield new TextEncoder().encode('data: [DONE]\\n\\n')
  })()
})
`

  /** Runs the script against the stub in a fresh repo with one untracked file; returns its exit and saved records. */
  function run(content) {
    const dir = mkdtempSync(join(tmpdir(), 'peer-review-main-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' })
      writeFileSync(join(dir, 'a.txt'), 'hello\n')
      const stubFile = join(dir, 'stub.cjs')
      writeFileSync(stubFile, stub)
      const env = { ...process.env, OPENROUTER_API_KEY: 'x', STUB_CONTENT: content }
      delete env.PEER_REVIEW_MODEL
      const res = spawnSync(process.execPath, ['--require', stubFile, script], { cwd: dir, env, encoding: 'utf8' })
      const out = join(dir, '.peer-review')
      const files = readdirSync(out)
      const read = (name) => JSON.parse(readFileSync(join(out, name), 'utf8'))
      return {
        status: res.status,
        raw: files.filter((f) => f.endsWith('.raw.json')).map(read),
        reviews: files.filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json')).map(read)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('exits 1 on an empty reply and saves why', () => {
    const { status, raw, reviews } = run('')
    assert.equal(status, 1)
    assert.equal(raw.length, 1)
    assert.equal(reviews.length, 0)
    assertSubset(raw[0], { provider: 'StubCo', finishReason: 'stop', nativeFinishReason: 'end_turn', reply: '' })
    assert.equal(raw[0].usage.cost, 0.5)
  })

  it('exits 1 on JSON that is not a review', () => {
    const { status, raw } = run('{"message":"done"}')
    assert.equal(status, 1)
    assert.equal(raw.length, 1)
  })

  it('exits 1 on a review whose every finding is dropped', () => {
    const { status, raw } = run('{"summary":"ok","findings":[{"file":"x","problem":"y"}]}')
    assert.equal(status, 1)
    assert.equal(raw.length, 1)
  })

  it('exits 0 on a review and saves it', () => {
    const { status, raw, reviews } = run('{"summary":"ok","findings":[]}')
    assert.equal(status, 0)
    assert.equal(raw.length, 0)
    assert.equal(reviews.length, 1)
    assertSubset(reviews[0], { provider: 'StubCo', finishReason: 'stop' })
  })
})
