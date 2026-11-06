import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { lint, online, quickStartCommands, quickStartScript, runQuickStart } from './readme-check.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const dirs = []
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'readme-test-'))
  dirs.push(dir)
  return dir
}
after(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const good = (base = 'https://img.shields.io') => `<h1 align="center">Lantern</h1>

<div align="center">
  <strong>Logs you can read at 3 a.m.</strong>
</div>
<div align="center">
  A log viewer for small teams on call.
</div>

<div align="center">
  <a href="https://example.test/ci"><img src="${base}/badge/ci-passing-green.svg" alt="CI" /></a>
  <a href="https://example.test/release"><img src="${base}/badge/version-1.2-blue.svg" alt="Version" /></a>
  <a href="LICENSE"><img src="${base}/badge/license-MIT-blue.svg" alt="License" /></a>
</div>

<p align="center">
  <img src="docs/demo.png" alt="Lantern showing a filtered log" width="640" />
</p>

## Features

- Find the failing request by its id
- Follow one request across services
- Share a filtered view as a link
- Runs from one binary

## Quick start

You need Node 22.

\`\`\`sh
echo built > out.txt
test -f out.txt
\`\`\`

## Examples

### Tail a file

\`\`\`sh
lantern app.log
\`\`\`

### Follow a request

\`\`\`sh
lantern app.log --request 42
\`\`\`

## Documentation

See [the docs](docs/index.md). The design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
`

const repoDir = () => {
  const dir = fresh()
  mkdirSync(join(dir, 'docs'))
  for (const name of ['LICENSE', 'CONTRIBUTING.md', 'ARCHITECTURE.md', 'docs/demo.png', 'docs/index.md']) {
    writeFileSync(join(dir, name), name.endsWith('.png') ? PNG : 'x')
  }
  return dir
}

test('the good fixture passes', () => {
  assert.deepEqual(lint(good(), repoDir()), [])
})

test('the template, once filled, passes', () => {
  const template = readFileSync(new URL('../references/template.md', import.meta.url), 'utf8').split('\n---\n')[1]
  const filled = template
    .replace(/\{\{Name\}\}/, 'Lantern')
    .replace(/\{\{language\}\}/g, 'sh')
    .replace(/\{\{CI badge\}\}|\{\{version badge\}\}|\{\{license badge\}\}/g, 'https://img.shields.io/badge/a-b-green.svg')
    .replace(/\{\{[^}]*\}\}/g, 'Plain words here')
  assert.deepEqual(lint(filled, repoDir()), [])
})

for (const [name, change, expected] of [
  ['an unfilled field', t => t.replace('Lantern</h1>', '{{Name}}</h1>'), /unfilled/],
  ['no title', t => t.replace(/<h1.*<\/h1>/, ''), /no project name/],
  ['a long line', t => t.replace('A log viewer for small teams on call.', 'A log viewer for small teams on call who want a very long line.'), /over 10 words/],
  ['two badges', t => t.replace(/ *<a href="LICENSE">.*\n/, ''), /2 badges/],
  ['six badges', t => t.replace('</div>\n\n<p', `${'  <a href="x"><img src="https://img.shields.io/badge/a-b-c.svg" /></a>\n'.repeat(3)}</div>\n\n<p`), /6 badges/],
  ['no visual', t => t.replace(/<p align="center">[\s\S]*?<\/p>/, ''), /no visual/],
  ['three features', t => t.replace('- Runs from one binary\n', ''), /3 features/],
  ['eight features', t => t.replace('- Runs from one binary\n', '- b\n- c\n- d\n- e\n- f\n'), /8 features/],
  ['six commands', t => t.replace('test -f out.txt', 'a\nb\nc\nd\ne'), /6 quick start/],
  ['one example', t => t.replace('### Follow a request', 'And more'), /1 examples/],
  ['no license section', t => t.replace('## License\n\nMIT. See [LICENSE](LICENSE).\n', ''), /no "license" section/],
  ['an empty section', t => t.replace('See [CONTRIBUTING.md](CONTRIBUTING.md).', ''), /"contributing" section is empty/],
  ['a docs section with no link', t => t.replace('See [the docs](docs/index.md). The design is in [ARCHITECTURE.md](ARCHITECTURE.md).', 'Read the code.'), /no link/],
  ['sections out of order', t => t.replace('## Features', '## Examples').replace('## Examples\n\n### Tail', '## Features\n\n### Tail'), /out of order/],
  ['an inline architecture essay', t => t.replace('## Contributing', `## Architecture\n\n${'word '.repeat(30)}\n\n## Contributing`), /ARCHITECTURE\.md/],
  ['an emoji bullet', t => t.replace('- Runs from one binary', '- \u{1F525} Runs from one binary'), /emoji bullet/],
  ['an em dash', t => t.replace('You need Node 22.', 'You need Node 22 — or newer.'), /em dash/],
  ['a semicolon in prose', t => t.replace('You need Node 22.', 'You need Node 22; or newer.'), /semicolon/],
  ['a marketing word', t => t.replace('You need Node 22.', 'A blazing tool.'), /marketing word/],
  ['the generator plug', t => t.replace('You need Node 22.', 'Try README Generator.'), /README Generator/],
  ['an invented star count', t => t.replace('You need Node 22.', 'Loved with 5,000 stars.'), /no <!-- source/],
  ['an invented percentage', t => t.replace('You need Node 22.', 'Repos get 50% more contributions.'), /no <!-- source/],
  ['an unbacked adoption claim', t => t.replace('You need Node 22.', 'Trusted by big teams.'), /no <!-- source/],
]) {
  test(`fails on ${name}`, () => {
    const found = lint(change(good()), repoDir()).join('\n')
    assert.match(found, expected)
  })
}

test('real output in a fence counts as the visual', () => {
  const text = good().replace(/<p align="center">[\s\S]*?<\/p>/, '```\n$ lantern app.log\n200 GET /health\n```')
  assert.deepEqual(lint(text, repoDir()), [])
})

test('bold text does not hide a number', () => {
  assert.match(lint(good().replace('You need Node 22.', '**5000** users run it.'), repoDir()).join(), /no <!-- source/)
})

test('a reference-style image counts as a badge and a visual', () => {
  const text = good().replace('<p align="center">\n  <img src="docs/demo.png" alt="Lantern showing a filtered log" width="640" />\n</p>', '![Demo][shot]')
    .replace('## License', '[shot]: docs/demo.png\n\n## License')
  assert.deepEqual(lint(text, repoDir()), [])
})

test('a heredoc counts as one command and keeps its body', () => {
  const text = good().replace('echo built > out.txt', "cat > c.yml <<'EOF'\nroot:\n  child: true\n  more: true\n  extra: true\n  last: true\nEOF")
  assert.deepEqual(quickStartCommands(text), ["cat > c.yml <<'EOF'", 'test -f out.txt'])
  assert.deepEqual(lint(text, repoDir()), [])
  assert.match(quickStartScript(text), /\n {2}child: true\n/)
})

test('a continued line is one command', () => {
  assert.equal(quickStartCommands(good().replace('echo built > out.txt', 'echo built \\\n  > out.txt')).length, 2)
})

test('a reference link satisfies the documentation section', () => {
  const text = good().replace('See [the docs](docs/index.md). The design is in [ARCHITECTURE.md](ARCHITECTURE.md).', 'See [the docs][docs].').replace('## License', '[docs]: docs/index.md\n\n## License')
  assert.deepEqual(lint(text, repoDir()), [])
})

test('a bracket that names no definition is not a link', () => {
  const text = good().replace('See [the docs](docs/index.md). The design is in [ARCHITECTURE.md](ARCHITECTURE.md).', 'See [the docs].')
  assert.match(lint(text, repoDir()).join(), /no link/)
})

test('a sourced number passes', () => {
  const text = good().replace('You need Node 22.', 'Parses 40 MB in a second, and 300 users run it. <!-- source: https://example.test/stats -->')
  assert.deepEqual(lint(text, repoDir()), [])
})

test('fails with no LICENSE file', () => {
  assert.match(lint(good(), fresh()).join(), /no LICENSE file/)
})

test('code blocks are not prose', () => {
  const text = good().replace('lantern app.log\n', 'const a = 1; // 5,000 stars\n')
  assert.deepEqual(lint(text, repoDir()), [])
})

test('reads quick start commands, dropping prompts and comments', () => {
  const text = good().replace('echo built > out.txt', '# set up\n$ echo built > out.txt')
  assert.deepEqual(quickStartCommands(text), ['echo built > out.txt', 'test -f out.txt'])
})

let server
let base
before(async () => {
  server = createServer((request, response) => {
    if (request.url.includes('gone')) return response.writeHead(404).end()
    if (request.url.includes('fake')) return response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg><text>repo or workflow not found</text></svg>')
    if (request.url.includes('page-as-badge')) return response.writeHead(200, { 'content-type': 'text/html' }).end('<html>')
    if (request.url.includes('corrupt')) return response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('not an svg')
    if (request.url.includes('.svg')) return response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg><text>passing</text></svg>')
    response.writeHead(200).end('ok')
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const live = () => good('').replace(/src="\/badge\/[^"]*"/g, match => `src="${base}/${match.slice(12, -5)}/badge.svg"`).replaceAll('https://example.test', base)

test('online passes when every link, image and badge resolves', async () => {
  assert.deepEqual(await online(live(), repoDir()), [])
})

test('online fails on a dead link', async () => {
  assert.match((await online(live().replace(`${base}/ci`, `${base}/gone`), repoDir())).join(), /HTTP 404/)
})

test('online fails on a missing local image', async () => {
  assert.match((await online(live().replace('docs/demo.png', 'docs/nope.png'), repoDir())).join(), /missing file/)
})

test('online fails on a broken anchor', async () => {
  const text = live().replace('## Documentation', '[up](#nowhere)\n\n## Documentation')
  assert.match((await online(text, repoDir())).join(), /broken anchor/)
})

test('online fails on a badge that reports an error', async () => {
  const text = live().replace('ci-passing-green/badge.svg', 'fake/badge.svg')
  assert.match((await online(text, repoDir())).join(), /reports an error/)
})

test('online fails on a dead reference link', async () => {
  const text = `${live()}\n[More][manual]\n\n[manual]: ${base}/gone\n`
  assert.match((await online(text, repoDir())).join(), /HTTP 404/)
})

test('online fails on a dead reference image', async () => {
  const text = `${live()}\n![Shot][shot]\n\n[shot]: ${base}/gone.png\n`
  assert.match((await online(text, repoDir())).join(), /HTTP 404/)
})

test('online fails on a dead source for a number', async () => {
  const text = live().replace('You need Node 22.', `5000 users run it. <!-- source: ${base}/gone -->`)
  assert.match((await online(text, repoDir())).join(), /HTTP 404/)
})

test('online fails on an image that serves a page', async () => {
  const text = live().replace('docs/demo.png', `${base}/page-as-badge/shot.png`)
  assert.match((await online(text, repoDir())).join(), /not an image/)
})

test('online fails on an SVG header over text', async () => {
  const text = live().replace('ci-passing-green/badge.svg', 'corrupt/badge.svg')
  assert.match((await online(text, repoDir())).join(), /not a valid image/)
})

test('online fails on a local image that is not one', async () => {
  const dir = repoDir()
  writeFileSync(join(dir, 'docs/demo.png'), 'this is text')
  assert.match((await online(live(), dir)).join(), /docs\/demo\.png: not a valid image/)
})

test('online fails on a truncated image, in each format', async () => {
  for (const bytes of [
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    PNG.subarray(0, 40),
    Buffer.from('GIF89a'),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
    Buffer.from('RIFF\xff\xff\x00\x00WEBPVP8 ', 'latin1'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>cut off'),
  ]) {
    const dir = repoDir()
    writeFileSync(join(dir, 'docs/demo.png'), bytes)
    assert.match((await online(live(), dir)).join(), /not a valid image/)
  }
})

test('online fails on a heading that is gone from a linked Markdown file', async () => {
  const dir = repoDir()
  writeFileSync(join(dir, 'guide.md'), '# Existing heading\n\n## Twice\n\n## Twice\n\n<a id="custom"></a>\n')
  const check = async link => online(live().replace('docs/index.md', link), dir)
  assert.match((await check('guide.md#missing-heading')).join(), /broken anchor guide\.md#missing-heading/)
  for (const link of ['guide.md#existing-heading', 'guide.md#twice-1', 'guide.md#custom']) assert.deepEqual(await check(link), [])
})

test('online fails on a badge URL that serves a page', async () => {
  const text = live().replace('ci-passing-green/badge.svg', 'page-as-badge/badge.svg')
  assert.match((await online(text, repoDir())).join(), /not an image/)
})

const repo = commit => {
  const dir = fresh()
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: dir, stdio: 'pipe' })
  git('init', '-q')
  writeFileSync(join(dir, 'setup.txt'), 'ready')
  git('add', '.')
  git('commit', '-qm', commit)
  return dir
}

test('the quick start runs on a fresh clone', () => {
  const text = good().replace('echo built > out.txt', 'test -f setup.txt').replace('test -f out.txt', 'echo ready')
  assert.deepEqual(runQuickStart(text, repo('one')), [])
})

test('a quick start that needs a file the clone lacks fails', () => {
  const text = good().replace('echo built > out.txt', 'test -f only-on-my-laptop.txt')
  assert.match(runQuickStart(text, repo('one')).join(), /failed on a fresh clone/)
})

test('a heredoc reaches the shell exactly as written', () => {
  const script = "cat > c.yml <<'EOF'\nroot:\n  child: true\nEOF\ngrep -q '^  child: true$' c.yml"
  const text = good().replace('echo built > out.txt\ntest -f out.txt', () => script)
  assert.deepEqual(runQuickStart(text, repo('one')), [])
})

test('a line that looks like a prompt stays when it is heredoc data', () => {
  const script = "cat > l.txt <<'EOF'\n$ VALUE\nEOF\n$ grep -Fq '$ VALUE' l.txt"
  const text = good().replace('echo built > out.txt\ntest -f out.txt', () => script)
  assert.equal(quickStartScript(text), "cat > l.txt <<'EOF'\n$ VALUE\nEOF\ngrep -Fq '$ VALUE' l.txt\n")
  assert.deepEqual(runQuickStart(text, repo('one')), [])
})

test('a here-string opens no heredoc, and a tab-indented terminator closes one', () => {
  const text = good().replace('echo built > out.txt\ntest -f out.txt', "cat <<< word\ncat <<-EOF\n\tbody\n\tEOF\necho after")
  assert.deepEqual(quickStartCommands(text), ['cat <<< word', 'cat <<-EOF', 'echo after'])
})

test('a clone that cannot start fails', () => {
  assert.match(runQuickStart(good(), 'file:///no/such/repo').join(), /could not clone/)
})
