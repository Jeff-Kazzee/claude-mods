import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Note, NoteAuthor, NoteStatus } from '../types'
import {
  INVITE_SECTION,
  PANE_LIMIT,
  PER_AGENT_CAP,
  TOOL_SPEC,
  admit,
  exportMarkdown,
  folderName,
  headline,
  isNoteKey,
  noteKey,
  parseNote,
  parseStoredNote,
  plural,
  prune,
  statusLine,
  unreadCount,
} from './gallery'

const PANE = 'peanut-gallery'
const NOTE_TOOL = 'mcp__peanut-gallery__note'

const notes = atom({ plugin: 'peanut-gallery', key: 'notes' } as const, [])
const agents = atom({ plugin: 'peanut-gallery', key: 'agents' } as const, {})

async function loadNotes($: EngineInterface): Promise<Note[]> {
  const keys = (await $.store.keys()).filter(isNoteKey)
  const values = await Promise.all(keys.map(key => $.store.get(key)))
  return values.flatMap(value => parseStoredNote(value) ?? [])
}

async function setStatus($: EngineInterface, ids: ReadonlySet<string>, status: NoteStatus): Promise<void> {
  const after = await update($, notes, list => list.map(note => (ids.has(note.id) ? { ...note, status } : note)))
  await Promise.all(after.filter(note => ids.has(note.id)).map(note => $.store.set(noteKey(note.id), note)))
  $.ui.status(statusLine(after))
}

async function authorOf($: EngineInterface, agentId: string | undefined): Promise<NoteAuthor> {
  if (agentId === undefined) return { kind: 'main', model: await $.session.model() }
  const spawned = (await read($, agents))[agentId]
  if (spawned !== undefined) return { kind: 'subagent', agentId, agentType: spawned.type, model: spawned.model }
  const listed = (await $.agent.list()).find(agent => agent.id === agentId)
  return listed === undefined ? { kind: 'subagent', agentId } : { kind: 'subagent', agentId, agentType: listed.type }
}

async function exportPath($: EngineInterface): Promise<string | undefined> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (home === undefined) return undefined
  const separator = home.includes('\\') ? '\\' : '/'
  return [home.replace(/[\\/]+$/, ''), '.claude', 'mod-data', 'peanut-gallery', 'notes.md'].join(separator)
}

async function exportNotes($: EngineInterface): Promise<string> {
  const path = await exportPath($)
  if (path === undefined) return 'No home folder is set, so nothing was written.'
  const list = await read($, notes)
  const count = list.filter(note => note.status !== 'archived').length
  try {
    await $.fs.write(path, exportMarkdown(list, await $.clock.now()))
  } catch (error) {
    return `The export failed. ${error instanceof Error ? error.message : String(error)}`
  }
  return `Wrote ${plural(count, 'note')} to ${path}.`
}

async function copyText($: EngineInterface, text: string, surface: RenderSurface): Promise<void> {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? 'Copied the note.' : `Could not copy the note. ${copied.reason}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register(TOOL_SPEC)
    await $.command.register({
      name: 'gallery',
      description: 'Open the peanut gallery. /gallery export writes the notes to a file.',
      argumentHint: '[export]',
    })
    const { kept, dropped } = prune(await loadNotes($))
    await Promise.all(dropped.map(note => $.store.delete(noteKey(note.id))))
    await update($, notes, () => kept)
    $.ui.status(statusLine(kept))

    return next(e)
  })

  on('tool.describe', { tool: NOTE_TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { sections: [...composed.sections, INVITE_SECTION] }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const { agentId, model } = started
    if (agentId !== undefined && model !== undefined) {
      await update($, agents, map => ({ ...map, [agentId]: { type: e.subagentType, model } }))
    }

    return started
  })

  on('tool.call', { tool: NOTE_TOOL }, async ($, e) => {
    const parsed = parseNote(e)
    if (!parsed.isValid) return { deny: parsed.error }

    const note: Note = {
      ...parsed.draft,
      project: parsed.draft.project ?? folderName(await $.session.root()),
      id: crypto.randomUUID(),
      time: await $.clock.now(),
      sessionId: await $.session.id(),
      author: await authorOf($, e.agentId),
      status: 'unread',
    }
    const after = await update($, notes, list => (admit(list, note) === 'kept' ? [note, ...list] : list))
    if (!after.some(kept => kept.id === note.id)) {
      return admit(after, note) === 'capped'
        ? { deny: `Not kept. Each agent may leave ${PER_AGENT_CAP} notes per session.` }
        : { result: 'Noted.' }
    }

    await $.store.set(noteKey(note.id), note)
    $.ui.status(statusLine(after))
    if (note.kind === 'criticism' && note.sting >= 2) {
      $.ui.toast(`A sting ${note.sting} criticism landed. Run /gallery to read it.`)
    }

    return { result: 'Noted.' }
  })

  on('command.run', { command: 'gallery' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'export') {
      $.ui.log(await exportNotes($))
      return {}
    }
    if (arg !== '') {
      $.ui.log('Run /gallery to open the notes, or /gallery export to write them to a file.')
      return {}
    }
    const opened = await $.ui.open({ id: PANE, title: 'Peanut gallery' })
    if (!opened.isPlaced) $.ui.log(`The gallery pane is not shown yet. ${opened.reason}`)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, notes)
    const now = await $.clock.now()
    const open = list.filter(note => note.status !== 'archived')
    const shown = open.slice(0, PANE_LIMIT)
    const unreadIds = new Set(open.filter(note => note.status === 'unread').map(note => note.id))
    const archived = list.length - open.length

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>
            {unreadCount(open)} unread of {plural(open.length, 'note')}. {archived} archived.
          </Text>
          {unreadIds.size > 0 && (
            <Button key="read-all" label="Mark all read" onPress={() => setStatus($, unreadIds, 'read')} />
          )}
        </Box>
        {shown.length === 0 && <Text dimColor>No notes yet. Agents leave them with the note tool.</Text>}
        {shown.map(note => (
          <Box key={`note:${note.id}`} flexDirection="column" marginTop={1}>
            <Text bold={note.status === 'unread'} wrap="truncate-end">
              {note.status === 'unread' ? 'new · ' : ''}
              {headline(note, now)}
            </Text>
            <Text>{note.text}</Text>
            {note.about !== undefined && <Text dimColor>About {note.about}</Text>}
            <Box flexDirection="row" gap={1}>
              {note.status === 'unread' && (
                <Button
                  key={`read:${note.id}`}
                  label="Mark read"
                  onPress={() => setStatus($, new Set([note.id]), 'read')}
                />
              )}
              <Button
                key={`archive:${note.id}`}
                label="Archive"
                onPress={() => setStatus($, new Set([note.id]), 'archived')}
              />
              <Button key={`copy:${note.id}`} label="Copy" onPress={press => copyText($, note.text, press.surface)} />
            </Box>
          </Box>
        ))}
        {open.length > shown.length && (
          <Text dimColor>
            {plural(open.length - shown.length, 'older note')} not shown. /gallery export writes them all.
          </Text>
        )}
      </Box>
    )
  })
}
