export type DelegateKind = 'agent' | 'shell'

export type DelegateOutcome = 'completed' | 'failed' | 'killed' | 'ended'

export type DelegateFacts = {
  id: string
  kind: DelegateKind
  processId: string
  sessionId: string
  cwd: string
  toolUseId?: string
  description: string
  agentType?: string
  model?: string
  brief: string
  briefPath?: string
  outputFile?: string
  parentId?: string
  isBackground: boolean
  startedAt: number
  lastActivityAt: number
}

export type DelegateRunning = DelegateFacts & { state: 'running' }

export type DelegateUnread = DelegateFacts & {
  state: 'done-unread'
  finishedAt: number
  outcome: DelegateOutcome
  isNagged: boolean
}

export type DelegateUsed = DelegateFacts & {
  state: 'done-used'
  finishedAt: number
  outcome: DelegateOutcome
  usedAt: number
  usedVia: string
}

export type DelegateOrphaned = DelegateFacts & {
  state: 'orphaned'
  orphanedAt: number
  isSettled: boolean
}

export type Delegate = DelegateRunning | DelegateUnread | DelegateUsed | DelegateOrphaned

export type DelegateState = Delegate['state']

export type ProcessRecord = {
  processId: string
  heartbeatAt: number
  delegates: Delegate[]
}

declare module 'claude-code' {
  interface PluginState {
    'delegate-ledger': {
      processId: string
      mine: Delegate[]
      others: Delegate[]
      /** The orphans section, fixed at session start so the system prompt stays cacheable. Empty for none. */
      orphansText: string
    }
  }
}
