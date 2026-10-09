// How git sees a file against HEAD; untracked files are not listed.
export type FileKind = 'modified' | 'added' | 'deleted'

// added and removed are null for a binary file.
export type FileChange = {
  path: string
  kind: FileKind
  added: number | null
  removed: number | null
  isBinary: boolean
}

// isRepo is false when the session's directory is not in a git repository.
export type Snapshot = { isRepo: boolean; files: FileChange[] }

declare module 'claude-code' {
  interface PluginState {
    'changed-files': { snapshot: Snapshot; hasOpened: boolean }
  }
}
