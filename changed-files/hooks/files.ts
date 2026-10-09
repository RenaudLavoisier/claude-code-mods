import type { FileChange } from '../types'

export type Change = Omit<FileChange, 'edits'>

export function countLines(text: string): number {
  if (text === '') return 0

  return text.replace(/\n$/, '').split('\n').length
}

// Adds the change to the file's entry and moves the file to the top.
export function record(list: readonly FileChange[], change: Change): FileChange[] {
  const known = list.find(file => file.path === change.path)
  const merged: FileChange = known
    ? {
        ...known,
        edits: known.edits + 1,
        added: known.added + change.added,
        removed: known.removed + change.removed,
      }
    : { ...change, edits: 1 }

  return [merged, ...list.filter(file => file.path !== change.path)]
}

export function relativeTo(cwd: string, path: string): string {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`

  return path.startsWith(root) ? path.slice(root.length) : path
}
