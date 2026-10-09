export type FileChange = { path: string; edits: number; added: number; removed: number; isNew: boolean }

declare module 'claude-code' {
  interface PluginState {
    'changed-files': { files: FileChange[] }
  }
}
