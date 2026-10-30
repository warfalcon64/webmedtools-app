// Run with: node --test scripts/doc-check.test.mjs (Node 18+, nothing to install)
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkRepo,
  citations,
  formatProblem,
  indexProblems,
  placeholderHits,
  PLACEHOLDERS,
  pointers,
  relativeLinks,
  ruleCitation,
  ruleItems,
  ruleNumbers,
  USAGE,
  wordCount
} from './doc-check.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'doc-check.mjs')
const KIT = join(dirname(SCRIPT), '..')

/** The keys of `expected` match in `actual`; anything else in `actual` is ignored. */
function assertSubset(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `key "${key}"`)
}

/** Run `fn` inside a fresh git repo holding `files`, then clean up whatever happens. */
function inRepo(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'doc-check-test-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' })
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      writeFileSync(join(dir, rel), text)
    }
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run the script inside `cwd`; returns its exit status and stdout lines. */
function runScript(cwd, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { status: result.status, lines: result.stdout.split('\n').filter(Boolean), stderr: result.stderr }
}

const record = (title) => `# ${title}\n\nDate: 2026-10-26\n\n## Context\nShort.\n`
const INDEX = '# Records\n\n| # | Decision |\n|---|---|\n| 0001 | [One](0001-one.md) |\n'
const CLEAN = {
  'CLAUDE.md': '# Repo\n\n## Rules\n- Keep it short. ADR 0001.\n- Wrapped rules end\n  on a later line (0001).\n\n## Docs\n- [index](docs/adr/README.md)\n',
  'docs/adr/README.md': INDEX,
  'docs/adr/0001-one.md': record('0001. One'),
  'docs/notes.md': 'See `docs/adr/0001-one.md:3` and [the record](adr/0001-one.md#context).\n'
}

describe('wordCount', () => {
  it('counts whitespace-separated words, as wc -w does', () => {
    assert.equal(wordCount('one  two\nthree\t— four\n'), 5)
    assert.equal(wordCount(''), 0)
  })
})

describe('indexProblems', () => {
  it('passes an index whose rows match the record files', () => {
    assert.deepEqual(indexProblems(INDEX, ['0001-one.md']), [])
  })

  it('counts a row whose link has a title or angle brackets', () => {
    const index = '| # | D |\n|---|---|\n| 0001 | [One](0001-one.md "first") |\n| 0002 | [Two](<./0002-two.md>) |\n'
    assert.deepEqual(indexProblems(index, ['0001-one.md', '0002-two.md']), [])
  })

  it('names a file with no row, leaving a row with no file to the link check', () => {
    assert.deepEqual(indexProblems(INDEX, ['0002-two.md']), [{ line: null, what: 'has no row for 0002-two.md' }])
  })
})

describe('relativeLinks', () => {
  it('keeps relative targets, without anchors or titles', () => {
    assert.deepEqual(relativeLinks("a\n[x](../a%20b.md#top \"T\") [y](<c d.md>) [z](shot(1).png 'T') [w](e.md (T))\n"), [
      { target: '../a b.md', line: 2 },
      { target: 'c d.md', line: 2 },
      { target: 'shot(1).png', line: 2 },
      { target: 'e.md', line: 2 }
    ])
    assert.deepEqual(relativeLinks('[d](docs/d.svg?raw=1#top)'), [{ target: 'docs/d.svg', line: 1 }])
  })

  it('skips web, mail and same-page links, and anything in code', () => {
    assert.deepEqual(relativeLinks('[a](https://x.y) [b](mailto:a@b) [c](#top) `[d](e.md)`\n```\n[f](g.md)\n```\n- item\n  ```md\n  [h](i.md)\n  ```\n````md\n```sh\n```\n[j](k.md)\n````\n[l](~/m.md) [n](//host/o.md)\n```md\n```js\n[p](q.md)\n```\n'), [])
  })
})

describe('pointers', () => {
  it('reads a backticked path and line, keeping the end of a range', () => {
    assert.deepEqual(pointers('x\n`scripts/a.mjs:42` and `b.md:3-9`'), [
      { path: 'scripts/a.mjs', target: 42, line: 2 },
      { path: 'b.md', target: 9, line: 2 }
    ])
  })

  it('ignores a bare line, a host and port, and a pointer outside backticks', () => {
    assert.deepEqual(pointers('`:44` `localhost:3000` `127.0.0.1:80` `https://a.io:443` a.mjs:4'), [])
  })
})

describe('citations', () => {
  it('reads one record, a list and a range', () => {
    assert.deepEqual(
      citations('ADR 0001.\nADRs 0002, 0003 and 0004; ADRs 0005–0008').map((c) => [c.number, c.line]),
      [['0001', 1], ['0002', 2], ['0003', 2], ['0004', 2], ['0005', 2], ['0006', 2], ['0007', 2], ['0008', 2]]
    )
  })

  it('finds nothing in prose without one', () => {
    assert.deepEqual(citations('the ADR index, 0001 alone, ADR-ish'), [])
  })
})

describe('ruleCitation', () => {
  it('reads each style a rule ends with', () => {
    assert.deepEqual(ruleCitation('Do it. ADR 0001.'), ['0001'])
    assert.deepEqual(ruleCitation('Do it (ADR 0001)'), ['0001'])
    assert.deepEqual(ruleCitation('Do it (0001).'), ['0001'])
    assert.deepEqual(ruleCitation('Do it (ADR 0014, 0027).'), ['0014', '0027'])
  })

  it('is null for a rule that does not end with one', () => {
    assert.equal(ruleCitation('Do it.'), null)
    assert.equal(ruleCitation('ADR 0001 says do it, always.'), null)
  })
})

describe('ruleNumbers', () => {
  it('takes the citation a rule ends with, else every ADR it names', () => {
    assert.deepEqual(ruleNumbers('Do it (0003).'), ['0003'])
    assert.deepEqual(ruleNumbers('The worksheet rules are in ADR 0002; changing one is a brainstorm.'), ['0002'])
    assert.deepEqual(ruleNumbers('Per ADR 0002 the staging port stays reserved (8080).'), ['0002'])
    assert.equal(ruleNumbers('Do it, always.'), null)
  })
})

describe('ruleItems', () => {
  it('joins continuation lines and stops at the next section', () => {
    const items = ruleItems('# R\n\n## Rules\n- one\n  more (0001).\n- two. ADR 0002.\n\n## Docs\n- not a rule\n')
    assert.deepEqual(items, [
      { text: 'one more (0001).', line: 4 },
      { text: 'two. ADR 0002.', line: 6 }
    ])
  })

  it('ends an item at a blank line, a sub-bullet, unindented text or any heading', () => {
    const items = ruleItems('## Rules\n- one (0001).\n\n  later prose\n- two (0002).\n  - a sub-bullet\n- three (0003).\nflush text\n- four (0004).\n### Notes\n- not a rule\n')
    assert.deepEqual(items.map((i) => i.text), ['one (0001).', 'two (0002).', 'three (0003).', 'four (0004).'])
  })

  it('is null without a Rules section', () => {
    assert.equal(ruleItems('# R\n\n## Docs\n- a\n'), null)
  })
})

describe('placeholderHits', () => {
  it('finds a placeholder wrapped across lines', () => {
    assertSubset(placeholderHits('a\n- `<typecheck\n  command>`')[0], { placeholder: '<typecheck command>', line: 2 })
  })

  it('passes a filled-in file and single-word placeholders', () => {
    assert.deepEqual(placeholderHits('`npm test`, `<dev>`, `<path>`'), [])
  })
})

describe('formatProblem and USAGE', () => {
  it('prints file, line when known, and what', () => {
    assert.equal(formatProblem({ file: 'a.md', line: 3, what: 'x' }), 'a.md:3 x')
    assert.equal(formatProblem({ file: 'a.md', line: null, what: 'x' }), 'a.md x')
  })

  it('--help prints USAGE and an unknown flag exits 1', () => {
    inRepo({}, (dir) => {
      assert.equal(runScript(dir, '--help').lines.join('\n'), USAGE)
      assert.equal(runScript(dir, '--nope').status, 1)
    })
  })
})

describe('PLACEHOLDERS', () => {
  // Only in the kit, whose bootstrap.mjs holds VERBATIM: a repo's own template/ folder is not the kit's.
  const bootstrap = join(dirname(SCRIPT), 'bootstrap.mjs')
  const inKit = existsSync(bootstrap) && readFileSync(bootstrap, 'utf8').includes('export const VERBATIM') && existsSync(join(KIT, 'template'))
  it('equals the multi-word placeholders in template/', { skip: !inKit }, () => {
    const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]))
    const found = new Set()
    for (const file of walk(join(KIT, 'template')).filter((f) => f.endsWith('.md'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/<[^<>]+>/g)) {
        const text = m[0].replace(/\s+/g, ' ')
        if (text.includes(' ')) found.add(text)
      }
    }
    assert.deepEqual([...PLACEHOLDERS].sort(), [...found].sort())
  })
})

describe('doc-check.mjs end to end', () => {
  it('passes a clean repo with no output', () => {
    inRepo(CLEAN, (dir) => {
      assert.deepEqual(checkRepo(dir), { failures: [], warnings: [] })
      assert.deepEqual(runScript(dir), { status: 0, lines: [], stderr: '' })
    })
  })

  it('prints a warning alone and still exits 0', () => {
    const records = Object.fromEntries(Array.from({ length: 41 }, (_, i) => {
      const n = String(i + 1).padStart(4, '0')
      return [`docs/adr/${n}-r.md`, record(n)]
    }))
    const rows = Object.keys(records).map((f) => `| x | [x](${f.slice(9)}) |`).join('\n')
    inRepo({ ...records, 'docs/adr/README.md': `| # | D |\n|---|---|\n${rows}\n`, 'CLAUDE.md': '# R\n\n## Rules\n- Cited. ADR 0041.\n' }, (dir) => {
      assert.deepEqual(runScript(dir), { status: 0, lines: ['warning: docs/adr holds 41 records; past ~40, merge or prune'], stderr: '' })
    })
  })

  it('checks a ../ pointer against the repo\'s file, never one beside the repo', () => {
    const parent = mkdtempSync(join(tmpdir(), 'doc-check-test-'))
    try {
      writeFileSync(join(parent, 'README.md'), 'x\n'.repeat(10))
      const app = join(parent, 'app')
      mkdirSync(join(app, 'docs'), { recursive: true })
      execFileSync('git', ['init', '-q'], { cwd: app, stdio: 'ignore' })
      writeFileSync(join(app, 'README.md'), 'x\n'.repeat(200))
      writeFileSync(join(app, 'docs', 'a.md'), '`../README.md:40` `../README.md:300`\n')
      assert.deepEqual(checkRepo(app).failures, [{ file: 'docs/a.md', line: 1, what: 'points at ../README.md:300, but ../README.md has 200 lines' }])
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('reports one problem of each kind and exits 1', () => {
    const records = Object.fromEntries(Array.from({ length: 41 }, (_, i) => {
      const n = String(i + 1).padStart(4, '0')
      return [`docs/adr/${n}-r.md`, record(n)]
    }))
    const rows = Object.keys(records).filter((f) => !f.includes('0041')).map((f) => `| x | [x](${f.slice(9)}) |`).join('\n')
    inRepo({
      ...records,
      'docs/adr/0001-r.md': `${'word '.repeat(400)}\n`,
      'docs/adr/README.md': `| # | D |\n|---|---|\n${rows}\n| 0099 | [gone](0099-gone.md) |\n`,
      'CLAUDE.md': '# R\n\n## Rules\n- No record here.\n- A missing one (0077).\n- The same one again (0077).\n```\n- An example rule.\n```\n\n## Next up\n<Two to five lines: what comes next and in\nwhat order, pointing at spec sections. Rewritten at every merge prep. This is the paragraph the next session reads first, so it must be true on the day it is read.>\n',
      'docs/notes.md': '[gone](missing.md)\n`docs/notes.md:99` `scripts/nope.mjs:1` `db.example.com:5432` `~/elsewhere/a.md:3` `../../../out/b.py:8`\nSee ADR 0050.\n```\nADR 0098 `src/x.ts:9`\n```\n[outside](../../../elsewhere.md)\n',
      'docs/handoff.md': '[ignored](nowhere.md)\n'
    }, (dir) => {
      const { status, lines } = runScript(dir)
      assert.equal(status, 1)
      assert.deepEqual(lines, [
        'warning: docs/adr holds 41 records; past ~40, merge or prune',
        'docs/adr/0001-r.md is 400 words; a record stays under 400',
        'docs/adr/README.md has no row for 0041-r.md',
        'CLAUDE.md:12 still holds the placeholder <Two to five lines: what comes next and in what...',
        'docs/adr/README.md:43 links 0099-gone.md, which does not exist',
        'docs/notes.md:1 links missing.md, which does not exist',
        'docs/notes.md:2 points at docs/notes.md:99, but docs/notes.md has 7 lines',
        'docs/notes.md:2 points at scripts/nope.mjs:1, but scripts/nope.mjs does not exist',
        'docs/notes.md:3 cites ADR 0050, which does not exist',
        'CLAUDE.md:4 has a rule that cites no ADR',
        'CLAUDE.md:5 cites ADR 0077, which does not exist',
        'CLAUDE.md:6 cites ADR 0077, which does not exist'
      ])
    })
  })

  it('fails records with no index file', () => {
    inRepo({ 'docs/adr/0001-one.md': record('0001. One') }, (dir) => {
      assert.deepEqual(runScript(dir), { status: 1, lines: ['docs/adr/README.md is missing, so no record has a row'], stderr: '' })
    })
  })

  it('fails outside a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doc-check-test-'))
    try {
      const { status, stderr } = runScript(dir)
      assert.equal(status, 1)
      assert.match(stderr, /Not inside a git repository/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
