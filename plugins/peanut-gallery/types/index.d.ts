export type NoteKind = 'comment' | 'reminder' | 'suggestion' | 'criticism'

export type Sting = 1 | 2 | 3

export type NoteBody =
  | { kind: 'criticism'; sting: Sting }
  | { kind: 'comment' | 'reminder' | 'suggestion' }

export type NoteAuthor =
  | { kind: 'main'; model?: string }
  | { kind: 'subagent'; agentId: string; agentType?: string; model?: string }

export type NoteStatus = 'unread' | 'read' | 'archived'

export type NoteOutcome = 'acted' | 'traced' | 'declined'

/** What a later agent did about the note. Jeff's own `status` stays apart from it. */
export type NoteResolution = {
  outcome: NoteOutcome
  text: string
  time: number
  sessionId: string
  author: NoteAuthor
}

export type Note = NoteBody & {
  id: string
  time: number
  sessionId: string
  text: string
  project?: string
  about?: string
  author: NoteAuthor
  status: NoteStatus
  resolution?: NoteResolution
}

export type SpawnedAgent = { type: string; model: string }

declare module 'claude-code' {
  interface PluginState {
    'peanut-gallery': {
      notes: Note[]
      agents: Record<string, SpawnedAgent>
      /** The open-notes section, fixed at session start so the system prompt stays cacheable. Empty for none. */
      leads: string
    }
  }
}
