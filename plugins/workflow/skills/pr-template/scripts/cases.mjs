// The bodies the tests judge, each with the answer expected. make-golden.mjs renders them through
// GitHub once, so the tests run offline against what GitHub really produces.

import { readFileSync } from 'node:fs'

const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
export const template = skill.match(/^````markdown\n([\s\S]*?)^````$/m)[1]
const good = template.replace(/\{\{.*?\}\}/g, 'filled in abc1234').replace(/Task: filled in abc1234/, 'Task: 179')
  .replace('**Level:** filled in abc1234', '**Level:** Low')

const section = (name, text) => good.replace(new RegExp(`(## ${name}\\n\\n).*\\n`), `$1${text}\n`)
const label = (name, text) => good.replace(new RegExp(`\\*\\*${name}:\\*\\* .*`), `**${name}:**${text}`)
const hollow = `${[
  '## ELI5', '## What Changed', '**Before:**', '**After:**', '**Mechanism:**', '## Why', '## Linked Issue',
  '## Proof', '## Testing', '## Risk', '**Level:**', '## AI Disclosure', '## Review', '## Checklist',
].join('\n\n')}\n\nTask: 179\n`

export const repo = 'Jeff-Kazzee/claude-mods'
const sha = 'a'.repeat(40)
export const pin = `https://github.com/${repo}/blob/${sha}/a.png?raw=true`
const video = pin.replace('a.png', 'a.mp4')
const off = 'not on an evidence ref:'

// `problems` is the exact list lintBody must return. `has` lists lines that must be among them.
export const lintCases = {
  'filled template': { body: good, problems: [] },
  'unfilled template': { body: template, has: ['unfilled {{field}}'] },
  'Proof spelling': { body: good.replace('## Visual Proof', '## Proof'), problems: [] },
  'Task none': { body: good.replace('Task: 179', 'Task: none'), problems: [] },
  'renamed section': { body: good.replace('## Risk', '## Hazards'), has: ['missing section: Risk'] },
  'swapped sections': {
    body: good.replace('## ELI5', '## TEMP').replace('## Why', '## ELI5').replace('## TEMP', '## Why'),
    hasPrefix: 'sections out of order',
  },
  hollow: {
    body: hollow,
    has: ['empty section: ELI5', 'empty section: Why', 'empty section: Linked Issue', 'empty section: Proof',
      'empty section: Testing', 'empty section: AI Disclosure', 'empty section: Review',
      'empty **Before:**', 'empty **After:**', 'empty **Mechanism:**', '**Level:** must say Low, Medium or High'],
  },
  'heading in a fence': { body: good.replace('## Risk', '```\n## Risk\n```'), has: ['missing section: Risk'] },
  'unclosed fence': { body: good.replace('## Risk', '```\nopen\n\n## Risk'), has: ['missing section: Risk', 'missing section: Checklist'] },
  'unclosed tilde fence': { body: good.replace('## Risk', '~~~\nopen\n\n## Risk'), has: ['missing section: Risk'] },
  'heading in a comment': { body: good.replace('## Risk', '<!--\n## Risk\n-->'), has: ['missing section: Risk'] },
  'list fence closed at column zero': {
    body: good.replace('## Risk', '- item\n\n  ```\n  code\n```\n\n## Risk'), has: ['missing section: Risk'],
  },
  'setext heading': { body: good.replace('## Risk', 'Risk\n---'), problems: [] },
  'closing hashes': { body: good.replace('## Risk', '## Risk ##'), problems: [] },
  'indented heading': { body: good.replace('## Risk', '   ## Risk'), problems: [] },
  'section of a comment': { body: section('Why', '<!-- later -->'), problems: ['empty section: Why'] },
  'section of a bare N/A': { body: section('Why', 'N/A'), problems: ['empty section: Why'] },
  'section of a bold N/A': { body: section('Why', '**N/A.**'), problems: ['empty section: Why'] },
  'section of a code N/A': { body: section('Why', '`N/A`'), problems: ['empty section: Why'] },
  'section of a list N/A': { body: section('Why', '- N/A'), problems: ['empty section: Why'] },
  'section of a quoted N/A': { body: section('Why', '> N/A'), problems: ['empty section: Why'] },
  'section of a bracketed N/A': { body: section('Why', '(N/A)'), problems: ['empty section: Why'] },
  'section of None': { body: section('Why', 'None:'), problems: ['empty section: Why'] },
  'section of an empty fence': { body: section('Why', '```\n```'), problems: ['empty section: Why'] },
  'N/A with a reason': { body: section('Linked Issue', 'N/A: Jeff asked in chat'), problems: [] },
  'section of a fenced block': { body: section('Why', '```text\noutput\n```'), problems: [] },
  'section of an image': { body: section('Why', `![a](${pin})`), problems: [] },
  'empty Level above the risk bullets': { body: label('Level', ''), problems: ['**Level:** must say Low, Medium or High'] },
  'empty Level above a bullet that says high': { body: label('Level', '\n\n- high traffic pages'), problems: ['**Level:** must say Low, Medium or High'] },
  'a Before that opens with bold and a colon': { body: label('Before', ' **Old:** the way it was'), problems: [] },
  'bare N/A Level': { body: label('Level', ' N/A'), problems: ['**Level:** must say Low, Medium or High'] },
  'Level in lower case': { body: label('Level', ' medium'), problems: [] },
  'Level absent': { body: good.replace('**Level:** Low', 'Low'), problems: ['missing **Level:**'] },
  'empty Mechanism above a smaller heading': { body: label('Mechanism', '\n\n### Notes\n\nMore.'), problems: ['empty **Mechanism:**'] },
  'empty Impact': { body: label('Impact', ''), problems: ['empty **Impact:**'] },
  'bare N/A Impact': { body: label('Impact', ' N/A'), problems: ['empty **Impact:**'] },
  'Impact absent': { body: good.replace(/\*\*Impact:\*\* .*/, 'filled in abc1234'), problems: ['missing **Impact:**'] },
  'section of entities only': { body: section('Why', '&nbsp;&#160;'), problems: ['empty section: Why'] },
  'label of a comment': { body: label('Before', ' <!-- later -->'), problems: ['empty **Before:**'] },
  'label of a bare N/A': { body: label('Before', ' N/A'), problems: ['empty **Before:**'] },
  'label of a code N/A': { body: label('Before', ' `N/A`'), problems: ['empty **Before:**'] },
  'label with its value on the next line': { body: label('Before', '\nthe old way'), problems: [] },
  'label of a code span': { body: label('Mechanism', ' `f()`'), problems: [] },
  'label absent': { body: good.replace('**Before:** filled in abc1234', 'filled in abc1234'), problems: ['missing **Before:**'] },
  'field in a code span': { body: good.replace('filled in abc1234', '`{{ .Values.image }}`'), problems: [] },
  'field in a fence': { body: section('Why', '```\n{{ x }}\n```'), problems: [] },
  'field in a highlighted fence': { body: section('Why', '```yaml\nsha: ${{ github.sha }}\n```'), problems: [] },
  'field in a mermaid fence': { body: section('Why', '```mermaid\ngraph TD\n  A{{start}} --> B\n```'), problems: [] },
  'field in a shell fence': { body: section('Why', '```sh\necho ${{ x }}\n```'), problems: [] },
  'a fence below a label': { body: label('Before', '\n\n```text\nold output\n```'), problems: [] },
  'a list below a label': { body: label('Before', '\n\n- old thing'), problems: [] },
  'a paragraph below a label': { body: label('Before', '\n\nThe old way.'), problems: [] },
  'a table below a label': { body: label('Before', '\n\n| a |\n| --- |\n| b |'), problems: [] },
  'a value that opens with bold and a colon': { body: label('Level', ' **High:** touches login'), problems: [] },
  'em dash': { body: good.replace('filled in abc1234', `filled ${String.fromCharCode(0x2014)} in`), problems: ['em dash'] },
  'text after the Task line': { body: `${good}\nsignature\n`, problems: ['last line is not Task: <id or none>'] },
  'right head': { body: good, head: 'abc1234ffffffffffffffffffffffffffffffffff', problems: [] },
  'wrong head': { body: good, head: 'def5678ffffffffffffffffffffffffffffffffff', problems: ['body does not name the head def5678'] },
  'CRLF': { body: good.replace(/\n/g, '\r\n'), problems: [] },
  'text before the first heading': { body: `A note first.\n\n${good}`, problems: [] },
  'empty label in a list': {
    body: good.replace('**Before:** filled in abc1234', '- **Before:**\n- something else'),
    problems: ['empty **Before:**'],
  },
  'empty label beside the next label': {
    body: good.replace('**Before:** filled in abc1234\n\n', '**Before:**\n'),
    problems: ['empty **Before:**'],
  },
}

// `pins` is how many URLs go to the lookup. `off` is how many are refused on sight.
const media = text => good.replace('## Why', `${text}\n\n## Why`)
export const mediaCases = {
  'a pin': { body: media(`![a](${pin})`), pins: 1, off: 0 },
  'a pin with the owner in lower case': { body: media(`![a](${pin.replace('Jeff-Kazzee', 'jeff-kazzee')})`), pins: 1, off: 0 },
  'a linked video': { body: media(`[![a](${pin})](${video})`), pins: 2, off: 0 },
  'a plain video link': { body: media(`[a](${video})`), pins: 1, off: 0 },
  'a raw source link': { body: media(`[source](https://github.com/${repo}/blob/${sha}/README.md?raw=true)`), pins: 0, off: 0 },
  'a browser upload': { body: media('![a](https://github.com/user-attachments/assets/abc)'), pins: 0, off: 0 },
  'an older upload': { body: media('![a](https://user-images.githubusercontent.com/1/abc.png)'), pins: 0, off: 0 },
  'a repo asset': { body: media(`![a](https://github.com/${repo}/assets/1/abc)`), pins: 0, off: 0 },
  'an emoji': { body: media(':shipit:'), pins: 0, off: 0 },
  'an image in a fence': { body: media('```\n![a](https://example.com/a.png)\n```'), pins: 0, off: 0 },
  'another owner': { body: media(`![a](${pin.replace('Jeff-Kazzee', 'someone')})`), pins: 0, off: 1 },
  'another repo': { body: media(`![a](${pin.replace('claude-mods', 'other')})`), pins: 0, off: 1 },
  'an upload host inside another URL': { body: media('![a](https://example.com/?x=https://github.com/user-attachments/a)'), pins: 0, off: 1 },
  'an external host': { body: media('![a](https://example.com/a.png)'), pins: 0, off: 1, names: 'https://example.com/a.png' },
  'a pin with more query': { body: media(`![a](${pin}&x=1)`), pins: 0, off: 1 },
  'no raw flag': { body: media(`![a](${pin.replace('?raw=true', '')})`), pins: 0, off: 1 },
  'the raw path': { body: media(`![a](${pin.replace('/blob/', '/raw/')})`), pins: 0, off: 1 },
  'the raw host': { body: media(`![a](https://raw.githubusercontent.com/${repo}/${sha}/a.png)`), pins: 0, off: 1 },
  'a branch name': { body: media(`![a](https://github.com/${repo}/blob/dev/a.png?raw=true)`), pins: 0, off: 1 },
  'a pin inside another URL': { body: media(`![a](https://example.com/?next=${pin})`), pins: 0, off: 1 },
  'a reference image': { body: media('![a][1]\n\n[1]: https://example.com/a.png'), pins: 0, off: 1 },
  'an img tag': { body: media('<img src="https://example.com/a.png">'), pins: 0, off: 1 },
  'an img tag with a tricky alt': { body: media('<img alt=">" src = https://example.com/a.png>'), pins: 0, off: 1 },
  'brackets in the alt text': { body: media('![fig [1]](https://example.com/a.png)'), pins: 0, off: 1 },
  'an image with a title': { body: media('![a](https://example.com/a.png "t")'), pins: 0, off: 1 },
  'an image in details': { body: media('<details>\n\n![a](https://example.com/a.png)\n\n</details>'), pins: 0, off: 1 },
}
export { off }
