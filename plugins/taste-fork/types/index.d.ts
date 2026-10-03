export type TasteOutcome =
  | { outcome: 'pending' }
  | { outcome: 'clean' }
  | { outcome: 'findings'; findings: number }
  | { outcome: 'failed'; reason: string }

export type TasteTrigger = 'write' | 'publish'

export type TasteReview = TasteOutcome & {
  id: string
  path: string
  hash: string
  via: TasteTrigger
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'taste-fork': { reviews: TasteReview[] }
  }
}
