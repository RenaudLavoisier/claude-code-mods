export type CheckBucket = 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel'

export type Check = { name: string; bucket: CheckBucket; link: string }

export type PullRequest = {
  number: number
  title: string
  url: string
  state: string
}

export type Snapshot = {
  branch: string
  pr: PullRequest | null
  checks: Check[]
  error: string | null
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'pr-checks': { snapshot: Snapshot | null; hasOpened: boolean }
  }
}
