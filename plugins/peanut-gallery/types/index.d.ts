export type NoteKind = 'comment' | 'reminder' | 'suggestion' | 'criticism'

export type Sting = 1 | 2 | 3

export type NoteBody =
  | { kind: 'criticism'; sting: Sting }
  | { kind: 'comment' | 'reminder' | 'suggestion' }

export type NoteAuthor =
  | { kind: 'main'; model?: string }
  | { kind: 'subagent'; agentId: string; agentType?: string; model?: string }

export type NoteStatus = 'unread' | 'read' | 'archived'

export type Note = NoteBody & {
  id: string
  time: number
  sessionId: string
  text: string
  project?: string
  about?: string
  author: NoteAuthor
  status: NoteStatus
}

export type SpawnedAgent = { type: string; model: string }

declare module 'claude-code' {
  interface PluginState {
    'peanut-gallery': {
      notes: Note[]
      agents: Record<string, SpawnedAgent>
    }
  }
}
