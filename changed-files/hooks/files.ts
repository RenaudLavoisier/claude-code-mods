import type { FileChange, FileKind } from '../types'

export type Count = Pick<FileChange, 'added' | 'removed' | 'isBinary'>

export const BINARY: Count = { added: null, removed: null, isBinary: true }

// `git diff --numstat -z --no-renames`: "added\tremoved\tpath\0" per file, "-\t-" for a binary one.
export function parseNumstat(out: string): Map<string, Count> {
  const counts = new Map<string, Count>()
  for (const record of out.split('\0')) {
    const [added, removed, ...path] = record.split('\t')
    if (added === undefined || removed === undefined || path.length === 0) continue

    counts.set(path.join('\t'), added === '-' ? BINARY : { added: Number(added), removed: Number(removed), isBinary: false })
  }

  return counts
}

// `git status --porcelain=v1 -z --no-renames`: "XY path\0" per file, X the index and Y the work tree.
export function parseStatus(out: string): Map<string, string> {
  const codes = new Map<string, string>()
  for (const record of out.split('\0')) {
    if (record.length > 3) codes.set(record.slice(3), record.slice(0, 2))
  }

  return codes
}

export function kindOf(code: string | undefined): FileKind {
  if (code?.[0] === 'A') return 'added'
  if (code?.includes('D')) return 'deleted'

  return 'modified'
}

// The files that differ from the base, sorted by path.
export function changesOf(root: string, counts: Map<string, Count>, codes: Map<string, string>): FileChange[] {
  return [...counts]
    .map(([path, count]): FileChange => ({
      path: `${root}/${path}`,
      kind: kindOf(codes.get(path)),
      ...count,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

export function relativeTo(cwd: string, path: string): string {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`

  return path.startsWith(root) ? path.slice(root.length) : path
}
