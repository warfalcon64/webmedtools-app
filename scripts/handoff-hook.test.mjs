// Run with: node --test scripts/handoff-hook.test.mjs (Node 18+, nothing to install)
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NO_CHANGE_LEAD,
  PLAN_APPROVED_LEAD,
  REVIEW_REASON,
  contextText,
  decideStop,
  hashOf,
  notesOf,
  phaseFiles,
  phaseMoved,
  phaseOf,
  postToolOutput,
  preToolOutput,
  recopyText,
  recordName,
  reviewPiped,
  sessionStartText,
  stopOutput
} from './handoff-hook.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'handoff-hook.mjs')
const HEADER = '# Handoff\n\nNotes on the change in progress. Keep them short.\n\nNow: nothing.\n'
const NOTE = '## Add export, phase 3 (implement), from abc1234\n- chose Word over PDF first\n'
const NOTE_4 = '## Add export, phase 4 (peer review), from abc1234\n- review asked for\n'
const PHASE_NAMES = ['brainstorm', 'plan', 'implement', 'peer-review', 'harden', 'merge-prep']
/** A fake workflow file's text, distinguishable by its marker. */
const marker = (n) => `PHASE-FILE-0${n}`

/** A fake docs/workflow/ in `dir`: README, project.md and 01–06, each with its own marker. */
function writeWorkflow(dir) {
  mkdirSync(join(dir, 'docs', 'workflow'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'workflow', 'README.md'), '# Workflow\nWORKFLOW-README\n')
  writeFileSync(join(dir, 'docs', 'workflow', 'project.md'), '# Project\nWORKFLOW-PROJECT\n')
  PHASE_NAMES.forEach((name, i) => writeFileSync(join(dir, 'docs', 'workflow', `0${i + 1}-${name}.md`), `# ${i + 1}\n${marker(i + 1)}\n`))
}

/** The phase-file markers in `out`, in order. */
const markers = (out) => out.match(/PHASE-FILE-0\d/g) ?? []

/** Run `fn` inside a fresh git repo with a .gitignore and a committed header-only handoff, then clean up. */
function inFreshRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-hook-test-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
    git('init', '-q')
    writeFileSync(join(dir, '.gitignore'), '.claude/handoff/\n')
    mkdirSync(join(dir, 'docs'))
    writeFileSync(join(dir, 'docs', 'handoff.md'), HEADER)
    writeWorkflow(dir)
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Run the hook for `event` with `input` (an object, or a raw string) in `dir`, with `env` added; returns its stdout. The
 * machine's own DOC_SYSTEM_KIT is dropped, so a real kit never joins the output.
 */
function hook(dir, event, input, env = {}) {
  const text = typeof input === 'string' ? input : JSON.stringify({ session_id: 's1', cwd: dir, ...input })
  const { DOC_SYSTEM_KIT, CLAUDE_PROJECT_DIR, ...rest } = process.env
  return execFileSync('node', [SCRIPT, event], { input: text, env: { ...rest, CLAUDE_PROJECT_DIR: dir, ...env }, encoding: 'utf8' })
}

const RECOPY_LEAD = /^The doc-system kit at .* has changes this repo lacks\.$/m

/**
 * Run `fn` with a fake kit: a committed git repo whose scripts/bootstrap.mjs is `source` (a canned drift), then clean
 * up. It stands in for the real kit, which a copied repo does not have.
 */
function withFakeKit(source, fn) {
  const kit = mkdtempSync(join(tmpdir(), 'handoff-hook-kit-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: kit, stdio: 'ignore' })
    git('init', '-q')
    mkdirSync(join(kit, 'scripts'))
    writeFileSync(join(kit, 'scripts', 'bootstrap.mjs'), source)
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
    fn(kit)
  } finally {
    rmSync(kit, { recursive: true, force: true })
  }
}

const DRIFT = "export const drift = () => ({ paths: ['docs/workflow/03-implement.md'], handBacks: [] })\n"

const handoff = (dir) => join(dir, 'docs', 'handoff.md')
const record = (dir, session = 's1') => JSON.parse(readFileSync(join(dir, '.claude', 'handoff', `${session}.json`), 'utf8'))

describe('notesOf', () => {
  it('returns everything from the first ## line on', () => {
    assert.equal(notesOf(HEADER + '\n' + NOTE), NOTE.trimEnd())
  })

  it('returns empty for a header-only file, no text, or ## not at a line start', () => {
    assert.equal(notesOf(HEADER), '')
    assert.equal(notesOf(''), '')
    assert.equal(notesOf(undefined), '')
    assert.equal(notesOf('# Handoff\nsee the ## below\n### deeper\n'), '')
  })
})

describe('sessionStartText', () => {
  it('leads with one line, then the notes', () => {
    const out = sessionStartText(HEADER + NOTE)
    assert.match(out.split('\n')[0], /change is in progress.*docs\/handoff\.md/)
    assert.ok(out.includes(NOTE.trimEnd()))
    assert.ok(!out.includes('# Handoff'))
  })

  it('is empty without notes', () => {
    assert.equal(sessionStartText(HEADER), '')
  })
})

describe('phaseOf and phaseFiles', () => {
  it('takes the phase from the last heading that names one, whatever its case', () => {
    assert.equal(phaseOf(HEADER + NOTE), 3)
    assert.equal(phaseOf(HEADER + NOTE + NOTE_4), 4)
    assert.equal(phaseOf(HEADER + NOTE + '## Loose thoughts\n'), 3)
    assert.equal(phaseOf(HEADER + '## Fix, PHASE 5 (harden), from x\n'), 5)
  })

  it('is null with no notes, or no heading that names a phase 1–6', () => {
    assert.equal(phaseOf(HEADER), null)
    assert.equal(phaseOf(null), null)
    assert.equal(phaseOf(HEADER + '## Loose thoughts\n'), null)
    assert.equal(phaseOf(HEADER + '## Fix, phase 7 (later), from x\n'), null)
    assert.equal(phaseOf(HEADER + '## Fix, phase three, from x\n'), null)
    assert.equal(phaseOf('# Handoff\nphase 3 in the header\n'), null)
  })

  it('gives 01 and 02 at the start, else the phase alone', () => {
    assert.deepEqual(phaseFiles(null), [1, 2])
    assert.deepEqual(phaseFiles(4), [4])
  })
})

describe('contextText and phaseMoved', () => {
  it('leads with one line, then each file, skipping missing ones', () => {
    assert.equal(contextText('Lead:', ['a\n', null, 'b']), 'Lead:\n\na\n\nb\n')
    assert.equal(contextText('Lead:', [null, '']), '')
  })

  it('tells never-injected apart from injected for no change', () => {
    assert.equal(phaseMoved(null, null), true)
    assert.equal(phaseMoved({ hash: 'h' }, null), true)
    assert.equal(phaseMoved({ phase: null }, null), false)
    assert.equal(phaseMoved({ phase: 3 }, 3), false)
    assert.equal(phaseMoved({ phase: 3 }, 4), true)
  })
})

describe('hashOf and recordName', () => {
  it('hashes contents and marks a missing file', () => {
    assert.equal(hashOf('a'), hashOf('a'))
    assert.notEqual(hashOf('a'), hashOf('b'))
    assert.equal(hashOf(null), 'missing')
  })

  it('keeps a session id from leaving the folder', () => {
    assert.equal(recordName('abc-123_x'), 'abc-123_x.json')
    assert.equal(recordName('../../etc/passwd'), '______etc_passwd.json')
    assert.equal(recordName(undefined), '')
  })
})

describe('decideStop', () => {
  const base = { stopHookActive: false, permissionMode: 'default', recorded: 'h', current: 'h', hasNotes: true, dirty: false }

  it('blocks an unchanged handoff while a change is in progress', () => {
    assert.equal(decideStop(base).block, true)
    assert.equal(decideStop({ ...base, hasNotes: false, dirty: true }).block, true)
  })

  it('allows on the loop guard, plan mode, no record, a write, or no change in progress', () => {
    assert.equal(decideStop({ ...base, stopHookActive: true }).block, false)
    assert.equal(decideStop({ ...base, permissionMode: 'plan' }).block, false)
    assert.equal(decideStop({ ...base, recorded: null }).block, false)
    assert.equal(decideStop({ ...base, current: 'other' }).block, false)
    assert.equal(decideStop({ ...base, hasNotes: false, dirty: false }).block, false)
    assert.equal(decideStop({ ...base, recorded: 'missing', current: 'missing', dirty: true }).block, false)
  })
})

describe('recopyText', () => {
  it('leads with the kit, lists the paths and the hand-backs, then says how to re-copy', () => {
    const out = recopyText({ kit: '/kit', repo: '/repo', paths: ['a.md', 'b.md'], handBacks: ['x'] })
    assert.equal(out.split('\n')[0], 'The doc-system kit at /kit has changes this repo lacks.')
    assert.ok(out.includes('2 files:\n- a.md\n- b.md\n'))
    assert.ok(out.includes('hand back 1 file '))
    assert.ok(out.includes('`node "/kit/scripts/bootstrap.mjs" "/repo" --dry-run`'))
    assert.ok(out.endsWith('finish what it hands back.\n'))
  })

  it('caps the list at five, and leaves out what is empty', () => {
    const paths = ['1', '2', '3', '4', '5', '6', '7']
    const out = recopyText({ kit: '/kit', repo: '/repo', paths, handBacks: [] })
    assert.deepEqual(out.match(/^- .*$/gm), ['- 1', '- 2', '- 3', '- 4', '- 5', '- and 2 more'])
    assert.ok(!out.includes('hand back'))
    const handBackOnly = recopyText({ kit: '/kit', repo: '/repo', paths: [], handBacks: ['x', 'y'] })
    assert.ok(!handBackOnly.includes('would create') && handBackOnly.includes('hand back 2 files '))
  })
})

describe('reviewPiped', () => {
  const KIT = '/Users/a b/doc-system-kit/scripts/peer-review.mjs'
  it('catches a review whose stdout is piped, redirected or captured', () => {
    for (const command of [
      'node scripts/peer-review.mjs | tail -5',
      'node scripts/peer-review.mjs | tee f',
      'node scripts/peer-review.mjs > f',
      'node scripts/peer-review.mjs >> f',
      'node scripts/peer-review.mjs 1> f',
      'node scripts/peer-review.mjs &> f',
      'node scripts/peer-review.mjs >| f',
      'node scripts/peer-review.mjs 2>&1 > f',
      '( node scripts/peer-review.mjs > f; echo done ) &',
      'node --env-file=.env scripts/peer-review.mjs 2>&1 | tail -20',
      'node scripts/peer-review.mjs --key-file .env | tail',
      `node "${KIT}" --key-file .env > /tmp/review.txt`,
      'X=$(node scripts/peer-review.mjs --key-file .env)',
      'out="$(node scripts/peer-review.mjs)"',
      'X=`node scripts/peer-review.mjs`',
      '$(OPENROUTER_API_KEY=x node scripts/peer-review.mjs)',
      'X=$(cd /tmp && node scripts/peer-review.mjs --key-file .env)',
      'X=$(env FOO=1 node scripts/peer-review.mjs)',
      'diff <(node scripts/peer-review.mjs) /dev/null',
      'node scripts/peer-review.mjs <<EOF | tail\nfocus on the hook\nEOF',
      'cat <<EOF\nbody\nEOF\nnode scripts/peer-review.mjs | tail'
    ])
      assert.equal(reviewPiped(command), true, command)
  })

  it('passes a bare review, stderr redirects, short runs and commands that only name the file', () => {
    for (const command of [
      'node scripts/peer-review.mjs',
      'node scripts/peer-review.mjs --key-file .env',
      'node scripts/peer-review.mjs 2>&1',
      'node scripts/peer-review.mjs 2> err',
      'node scripts/peer-review.mjs >&2',
      'node scripts/peer-review.mjs --dry-run | tail',
      'node scripts/peer-review.mjs --help | head',
      'node scripts/peer-review.mjs -h > usage.txt',
      "OPENROUTER_API_KEY=$(sed -n 's/^KEY=//p' .env | tr -d '\\n') node scripts/peer-review.mjs",
      'node scripts/peer-review.mjs --focus "a | b > c"',
      "node scripts/peer-review.mjs --focus 'x > y'",
      'node --test scripts/peer-review.test.mjs | tail',
      'grep -n x scripts/peer-review.mjs | head',
      'cat scripts/peer-review.mjs > copy.mjs',
      'node scripts/peer-review.mjs || true',
      'ls | head',
      'X=$(node scripts/peer-review.mjs --dry-run)',
      'X=$(node scripts/peer-review.mjs --help)',
      "echo '$(node scripts/peer-review.mjs)'",
      'X=$(node --test scripts/peer-review.test.mjs)',
      'OPENROUTER_API_KEY=`cat .env` node scripts/peer-review.mjs --key-file .env',
      '( node scripts/peer-review.mjs )',
      'X=$(sed -n p .env) node scripts/peer-review.mjs',
      'OPENROUTER_API_KEY="$(grep "^KEY=" .env | cut -d= -f2)" node scripts/peer-review.mjs',
      "git commit -F - <<'END-OF-NOTES'\nnode scripts/peer-review.mjs | tail -5\nEND-OF-NOTES",
      'cat <<EOF.txt\nnode scripts/peer-review.mjs > f\nEOF.txt',
      "git commit -F - <<'EOF'\nRun node scripts/peer-review.mjs | tail\nEOF",
      "python3 - <<'EOF'\ns = 'node scripts/peer-review.mjs > f'\nEOF",
      'cat <<EOF > notes.txt\nnode scripts/peer-review.mjs | tail\nEOF',
      'cat <<"EOF"\nnode scripts/peer-review.mjs > f\nEOF',
      'cat <<-EOF\n\tnode scripts/peer-review.mjs > f\n\tEOF',
      "cat <<'EOF'\nnode scripts/peer-review.mjs | tail\nnever closed",
      undefined
    ])
      assert.equal(reviewPiped(command), false, command)
  })
})

describe('the re-copy notice at session-start', () => {
  it('comes last when the kit has changes and both repos are at a clean point', () => {
    withFakeKit(DRIFT, (kit) =>
      inFreshRepo((dir) => {
        const out = hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit })
        assert.match(out, RECOPY_LEAD)
        assert.ok(out.indexOf(marker(2)) < out.search(RECOPY_LEAD))
        assert.ok(out.includes('- docs/workflow/03-implement.md'))
        assert.ok(out.includes(`"${realpathSync(kit)}/scripts/bootstrap.mjs" "${realpathSync(dir)}" --dry-run`))
        assert.deepEqual(markers(out), [marker(1), marker(2)])
      })
    )
  })

  it('shows on startup and clear, but not on compact, resume or in plan mode', () => {
    withFakeKit(DRIFT, (kit) =>
      inFreshRepo((dir) => {
        const env = { DOC_SYSTEM_KIT: kit }
        for (const source of ['startup', 'clear']) assert.match(hook(dir, 'session-start', { source }, env), RECOPY_LEAD, source)
        for (const source of ['compact', 'resume']) assert.doesNotMatch(hook(dir, 'session-start', { source }, env), RECOPY_LEAD, source)
        assert.doesNotMatch(hook(dir, 'session-start', { source: 'startup', permission_mode: 'plan' }, env), RECOPY_LEAD)
      })
    )
  })

  it('stays out without DOC_SYSTEM_KIT, with notes, or on a dirty repo', () => {
    withFakeKit(DRIFT, (kit) =>
      inFreshRepo((dir) => {
        assert.doesNotMatch(hook(dir, 'session-start', {}), RECOPY_LEAD)
        writeFileSync(join(dir, 'work.txt'), 'x')
        assert.doesNotMatch(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
        rmSync(join(dir, 'work.txt'))
        appendFileSync(handoff(dir), NOTE)
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'notes'], { cwd: dir, stdio: 'ignore' })
        assert.doesNotMatch(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
      })
    )
  })

  it('stays out when the kit is dirty, or the repo is the kit, but not for an untracked file in the kit', () => {
    withFakeKit(DRIFT, (kit) =>
      inFreshRepo((dir) => {
        assert.doesNotMatch(hook(kit, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
        writeFileSync(join(kit, 'scratch.txt'), 'x')
        assert.match(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
        appendFileSync(join(kit, 'scripts', 'bootstrap.mjs'), '// work\n')
        assert.doesNotMatch(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
      })
    )
  })

  it('stays out when git fails in the kit or the repo, or the kit has no bootstrap.mjs', () => {
    withFakeKit(DRIFT, (kit) => {
      const plain = mkdtempSync(join(tmpdir(), 'handoff-hook-test-'))
      try {
        // A repo that is not a git repo cannot be known clean.
        mkdirSync(join(plain, 'docs'))
        writeFileSync(handoff(plain), HEADER)
        assert.doesNotMatch(hook(plain, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
        inFreshRepo((dir) => {
          // A kit that is not a git repo cannot be known clean.
          mkdirSync(join(plain, 'scripts'))
          writeFileSync(join(plain, 'scripts', 'bootstrap.mjs'), DRIFT)
          assert.doesNotMatch(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: plain }), RECOPY_LEAD)
          // A clean kit without the script.
          execFileSync('git', ['rm', '-rq', 'scripts'], { cwd: kit, stdio: 'ignore' })
          execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'drop'], { cwd: kit, stdio: 'ignore' })
          assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: kit, encoding: 'utf8' }), '')
          assert.doesNotMatch(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit }), RECOPY_LEAD)
        })
      } finally {
        rmSync(plain, { recursive: true, force: true })
      }
    })
  })

  it('stays out, keeping the rest, when the drift has no path, is missing, throws or the kit is absent', () => {
    const kits = [
      'export const drift = () => ({ paths: [], handBacks: [] })\n',
      "export const drift = () => ({ paths: [], handBacks: ['x'] })\n",
      'export const other = 1\n',
      "export const drift = async () => { throw new Error('x') }\n",
      "throw new Error('broken kit')\n"
    ]
    for (const source of kits) {
      withFakeKit(source, (kit) =>
        inFreshRepo((dir) => {
          const out = hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: kit })
          assert.doesNotMatch(out, RECOPY_LEAD, source)
          assert.deepEqual(markers(out), [marker(1), marker(2)], source)
        })
      )
    }
    inFreshRepo((dir) => assert.deepEqual(markers(hook(dir, 'session-start', {}, { DOC_SYSTEM_KIT: join(dir, 'missing') })), [marker(1), marker(2)]))
  })
})

describe('the script', () => {
  it('does not run when imported by another file of the same name, as the kit imports its own copy', () => {
    inFreshRepo((dir) => {
      const other = join(dir, 'other', 'handoff-hook.mjs')
      mkdirSync(dirname(other))
      writeFileSync(other, `import ${JSON.stringify(pathToFileURL(SCRIPT).href)}\n`)
      const { DOC_SYSTEM_KIT, CLAUDE_PROJECT_DIR, ...rest } = process.env
      const out = execFileSync('node', [other, 'session-start'], { input: JSON.stringify({ cwd: dir }), env: { ...rest, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' })
      assert.equal(out, '')
    })
  })

  it('session-start prints the notes, the workflow and the current phase, in order', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      const out = hook(dir, 'session-start', { source: 'compact' })
      const at = (text) => out.indexOf(text)
      assert.ok(at(NOTE.trimEnd()) >= 0 && at(NOTE.trimEnd()) < at('WORKFLOW-README'))
      assert.ok(at('WORKFLOW-README') < at('WORKFLOW-PROJECT') && at('WORKFLOW-PROJECT') < at(marker(3)))
      assert.deepEqual(markers(out), [marker(3)])
      assert.ok(!out.includes('# Handoff'))
      assert.equal(record(dir).phase, 3)
    })
  })

  it('session-start with no notes prints the workflow and 01 + 02 under the no-change line', () => {
    inFreshRepo((dir) => {
      const out = hook(dir, 'session-start', { source: 'startup' })
      assert.ok(out.includes('WORKFLOW-README') && out.includes('WORKFLOW-PROJECT'))
      assert.ok(out.indexOf(NO_CHANGE_LEAD) < out.indexOf(marker(1)))
      assert.deepEqual(markers(out), [marker(1), marker(2)])
      assert.deepEqual(record(dir), { phase: null })
    })
  })

  it('prompt re-injects when the phase moves, and 01 + 02 once the notes are wiped', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      hook(dir, 'session-start', {})
      assert.equal(hook(dir, 'prompt', {}), '')
      appendFileSync(handoff(dir), NOTE_4)
      assert.deepEqual(markers(hook(dir, 'prompt', {})), [marker(4)])
      assert.equal(hook(dir, 'prompt', {}), '')
      writeFileSync(handoff(dir), HEADER)
      const out = hook(dir, 'prompt', {})
      assert.ok(out.startsWith(NO_CHANGE_LEAD))
      assert.deepEqual(markers(out), [marker(1), marker(2)])
      assert.deepEqual(record(dir), { phase: null, hash: hashOf(HEADER) })
    })
  })

  it('prompt prints nothing with no change after session-start', () => {
    inFreshRepo((dir) => {
      hook(dir, 'session-start', {})
      assert.equal(hook(dir, 'prompt', {}), '')
    })
  })

  it('pre-tool refuses a piped review and stays silent otherwise', () => {
    inFreshRepo((dir) => {
      const piped = hook(dir, 'pre-tool', { tool_name: 'Bash', tool_input: { command: 'node scripts/peer-review.mjs | tail -5' } })
      assert.deepEqual(JSON.parse(piped), preToolOutput(REVIEW_REASON))
      assert.equal(JSON.parse(piped).hookSpecificOutput.permissionDecision, 'deny')
      assert.equal(hook(dir, 'pre-tool', { tool_name: 'Bash', tool_input: { command: 'node scripts/peer-review.mjs' } }), '')
      assert.equal(hook(dir, 'pre-tool', { tool_name: 'Edit', tool_input: { command: 'node scripts/peer-review.mjs | tail' } }), '')
      assert.equal(hook(dir, 'pre-tool', { tool_name: 'Bash' }), '')
    })
  })

  it('post-tool gives a moved phase, nothing when it stays, 03 after ExitPlanMode, and keeps the hash', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      hook(dir, 'prompt', {})
      const hash = record(dir).hash
      assert.equal(hook(dir, 'post-tool', { tool_name: 'Edit' }), '')
      appendFileSync(handoff(dir), NOTE_4)
      const moved = JSON.parse(hook(dir, 'post-tool', { tool_name: 'Edit' }))
      assert.equal(moved.hookSpecificOutput.hookEventName, 'PostToolUse')
      assert.deepEqual(markers(moved.hookSpecificOutput.additionalContext), [marker(4)])
      assert.deepEqual(record(dir), { hash, phase: 4 })
      // A plan approved mid-change leaves the phase alone.
      assert.equal(hook(dir, 'post-tool', { tool_name: 'ExitPlanMode' }), '')
      assert.deepEqual(record(dir), { hash, phase: 4 })
    })
  })

  it('post-tool gives 03 when a plan is approved at the start of a change', () => {
    inFreshRepo((dir) => {
      hook(dir, 'session-start', {})
      const approved = JSON.parse(hook(dir, 'post-tool', { tool_name: 'ExitPlanMode' }))
      assert.ok(approved.hookSpecificOutput.additionalContext.startsWith(PLAN_APPROVED_LEAD))
      assert.deepEqual(markers(approved.hookSpecificOutput.additionalContext), [marker(3)])
      assert.deepEqual(record(dir), { phase: 3 })
    })
  })

  it('notes that name no phase get no phase file, not the no-change 01 + 02', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), '## Loose thoughts\n- maybe later\n')
      const out = hook(dir, 'session-start', {})
      assert.ok(out.includes('Loose thoughts') && out.includes('WORKFLOW-README'))
      assert.ok(!out.includes(NO_CHANGE_LEAD))
      assert.deepEqual(markers(out), [])
      assert.equal(hook(dir, 'prompt', {}), '')
    })
  })

  it('post-tool with no record and no change prints nothing', () => {
    inFreshRepo((dir) => {
      assert.equal(hook(dir, 'post-tool', { tool_name: 'Bash' }), '')
      assert.deepEqual(postToolOutput('x').hookSpecificOutput, { hookEventName: 'PostToolUse', additionalContext: 'x' })
    })
  })

  it('blocks a stop after a prompt with no edit while notes are present', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      assert.deepEqual(markers(hook(dir, 'prompt', { prompt: 'go' })), [marker(3)])
      assert.deepEqual(JSON.parse(hook(dir, 'stop', {})), stopOutput())
    })
  })

  it('allows a stop when only session-start has written the record', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      hook(dir, 'session-start', {})
      assert.equal(hook(dir, 'stop', {}), '')
    })
  })

  it('allows a stop when the handoff was edited this turn', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      hook(dir, 'prompt', {})
      appendFileSync(handoff(dir), '- found the bug\n')
      assert.equal(hook(dir, 'stop', {}), '')
    })
  })

  it('allows on stop_hook_active and in plan mode', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      hook(dir, 'prompt', {})
      assert.equal(hook(dir, 'stop', { stop_hook_active: true }), '')
      assert.equal(hook(dir, 'stop', { permission_mode: 'plan' }), '')
    })
  })

  it('allows a header-only handoff on a clean tree, and blocks it on a dirty one', () => {
    inFreshRepo((dir) => {
      hook(dir, 'prompt', {})
      assert.equal(hook(dir, 'stop', {}), '')
      writeFileSync(join(dir, 'work.txt'), 'x')
      assert.deepEqual(JSON.parse(hook(dir, 'stop', {})), stopOutput())
    })
  })

  it('does not count its own records as work, even where .gitignore misses them', () => {
    inFreshRepo((dir) => {
      writeFileSync(join(dir, '.gitignore'), '')
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'unignore'], { cwd: dir, stdio: 'ignore' })
      hook(dir, 'prompt', {})
      assert.equal(hook(dir, 'stop', {}), '')
    })
  })

  it('allows a header-only handoff outside a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'handoff-hook-test-'))
    try {
      mkdirSync(join(dir, 'docs'))
      writeFileSync(handoff(dir), HEADER)
      hook(dir, 'prompt', {})
      assert.equal(hook(dir, 'stop', {}), '')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('allows when there is no record for the session', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      hook(dir, 'prompt', { session_id: 'other' })
      assert.equal(hook(dir, 'stop', {}), '')
    })
  })

  it('exits 0 with no output on garbage stdin or an unknown event', () => {
    inFreshRepo((dir) => {
      appendFileSync(handoff(dir), NOTE)
      for (const event of ['session-start', 'prompt', 'pre-tool', 'post-tool', 'stop']) assert.equal(hook(dir, event, 'not json {'), '')
      assert.equal(hook(dir, 'nonsense', {}), '')
    })
  })
})
