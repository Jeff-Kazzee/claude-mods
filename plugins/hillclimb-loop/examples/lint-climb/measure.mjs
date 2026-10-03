import { readFileSync } from 'node:fs'

const text = readFileSync(process.argv[2] ?? 'draft.md', 'utf8')
const patterns = [
  new RegExp(String.fromCharCode(0x2014), 'g'),
  /;/g,
  /\b(seamless(ly)?|robust|powerful|cutting-edge|leverag(e|es|ing)|delve|unlock|elevate|game-changer|revolutionary|effortless(ly)?|world-class|innovative)\b/gi,
  /\b(very|really|just|actually|basically|quite|truly)\b/gi,
]
const slop = patterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0)
const words = text.split(/\s+/).filter(Boolean).length
console.log(`slop=${slop}`)
console.log(`words=${words}`)
