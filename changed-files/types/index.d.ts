// How git sees a file against HEAD; untracked files are listed too.
export type FileKind = 'modified' | 'added' | 'deleted' | 'untracked'

// added and removed are null when the lines were not counted: a binary file, or an
// untracked file too big to read or past the first ones counted.
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
