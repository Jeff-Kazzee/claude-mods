// Repository checks that need no Claude Code CLI, so CI can run them on every dev head.
//
//   node scripts/ci-check.mjs
//
// 1. marketplace.json parses, and every listed plugin folder has a plugin.json with the same name.
// 2. Every plugins/*/skills/*/SKILL.md has frontmatter whose name matches its folder and whose
//    description is 1 to 1024 characters (the Agent Skills limit Codex and Cline enforce).
// 3. Authored Markdown has no em dash (Jeff's writing law). Vendored upstream skill text under
//    plugins/tstack/skills is exempt, because the sync script copies it byte for byte.
// Exits 1 with one line per problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const problems = []

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    if (name === 'node_modules' || name === '.git') return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
for (const entry of marketplace.plugins) {
  const manifest = join(root, entry.source, '.claude-plugin/plugin.json')
  if (!existsSync(manifest)) {
    problems.push(`${entry.name}: no plugin.json at ${entry.source}`)
    continue
  }
  const plugin = JSON.parse(readFileSync(manifest, 'utf8'))
  if (plugin.name !== entry.name) problems.push(`${entry.name}: plugin.json name is ${plugin.name}`)
  if (!plugin.version) problems.push(`${entry.name}: plugin.json has no version`)
}

let skills = 0
for (const plugin of readdirSync(join(root, 'plugins'))) {
  const dir = join(root, 'plugins', plugin, 'skills')
  if (!existsSync(dir)) continue
  for (const skill of readdirSync(dir)) {
    const file = join(dir, skill, 'SKILL.md')
    if (!existsSync(file)) continue
    skills += 1
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    const head = text.match(/^---\n([\s\S]*?)\n---\n/)
    if (!head) {
      problems.push(`${relative(root, file)}: no frontmatter`)
      continue
    }
    const name = head[1].match(/^name:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '')
    const description = head[1].match(/^description:\s*(.+)$/m)?.[1].trim() ?? ''
    if (name !== skill) problems.push(`${relative(root, file)}: name ${name} does not match folder ${skill}`)
    if (description.length < 1 || description.length > 1024) {
      problems.push(`${relative(root, file)}: description is ${description.length} characters`)
    }
  }
}

const vendored = join(root, 'plugins', 'tstack', 'skills')
const authored = [...walk(join(root, 'plugins')), join(root, 'README.md'), join(root, 'AGENTS.md')]
  .filter(file => file.endsWith('.md') && !file.startsWith(vendored))
for (const file of authored) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (line.includes('\u2014')) problems.push(`${relative(root, file)}:${index + 1}: em dash`)
  })
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`ok: ${marketplace.plugins.length} plugins, ${skills} skills, ${authored.length} authored files`)
