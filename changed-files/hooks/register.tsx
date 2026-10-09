import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { changesOf, parseNumstat, parseStatus, relativeTo } from './files'
import type { FileChange, Snapshot } from '../types'

const PANE = 'changed-files'
const TITLE = 'Changed files'
// While the pane is open, how often git is read again, to follow changes made outside the session.
const POLL_MS = 5_000
// Once one of these tools has run, git is read again at once.
const CHANGING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])

const changes = atom({ plugin: 'changed-files', key: 'snapshot' } as const, { isRepo: true, files: [] })
const hasOpened = atom({ plugin: 'changed-files', key: 'hasOpened' } as const, false)

// The empty tree: the base of a repository with no commit yet.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// --no-optional-locks: a read from the timer never takes index.lock from the person's own git.
async function git($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  const ran = await $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 10_000 })

  return ran.exitCode === 0 ? ran.stdout : null
}

// What `git diff HEAD` and `git status` say changed in the repository that holds cwd, untracked files left out.
async function snapshot($: EngineInterface, cwd: string): Promise<Snapshot> {
  const top = await git($, cwd, ['rev-parse', '--show-toplevel'])
  if (top === null) return { isRepo: false, files: [] }

  const root = top.trim()
  const head = await git($, root, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  const [diff, status] = await Promise.all([
    git($, root, ['diff', head === null ? EMPTY_TREE : 'HEAD', '--numstat', '-z', '--no-renames']),
    git($, root, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--no-renames']),
  ])
  if (diff === null || status === null) throw new Error(`git diff or git status failed in ${root}`)

  return { isRepo: true, files: changesOf(root, parseNumstat(diff), parseStatus(status)) }
}

let running: Promise<Snapshot> | null = null
let isStale = false
let poll: Timer | null = null

// One git read at a time: a refresh asked during one reads again once it is done.
function refresh($: EngineInterface): Promise<Snapshot> {
  if (running !== null) {
    isStale = true

    return running
  }
  running = (async () => {
    let latest: Snapshot
    do {
      isStale = false
      latest = await snapshot($, await $.session.cwd())
      const current = await read($, changes)
      if (JSON.stringify(current) !== JSON.stringify(latest)) {
        await update($, changes, () => latest)
      }
    } while (isStale)

    return latest
  })().finally(() => {
    running = null
  })

  return running
}

function refreshQuietly($: EngineInterface): Promise<Snapshot | null> {
  return refresh($).catch(error => {
    $.ui.log(`changed-files: ${String(error)}`, { to: 'debug' })

    return null
  })
}

async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  poll ??= $.clock.every(POLL_MS, () => void refreshQuietly($))

  return opened
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changes',
      description: 'Show the files that differ from HEAD in this repository',
    })
    void refreshQuietly($)

    return next(e)
  })

  on('command.run', { command: 'changes' }, async $ => {
    await refreshQuietly($)
    await openPane($)

    return { text: 'Changed files pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) {
      poll?.cancel()
      poll = null
    }

    return closed
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || !CHANGING_TOOLS.has(String(e.tool))) {
      return ran
    }

    const latest = await refreshQuietly($)
    if (latest !== null && latest.files.length > 0 && !(await read($, hasOpened))) {
      await update($, hasOpened, () => true)
      // Opened unasked, the pane waits undrawn below 144 columns: point to /changes.
      const opened = await openPane($)
      if (!opened.isPlaced) {
        $.ui.toast('Terminal too narrow to open the pane: type /changes to see the changed files', {
          timeoutMs: 10_000,
        })
      }
    }

    return ran
  }).catch(($, e, next) => next(e)) // A failure here never runs the tool twice: next replays.

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { isRepo, files } = await read($, changes)
    const cwd = await $.session.cwd()
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)
    const added = files.reduce((sum, file) => sum + (file.added ?? 0), 0)
    const removed = files.reduce((sum, file) => sum + (file.removed ?? 0), 0)
    const lines = (file: FileChange) =>
      file.added === null || file.removed === null
        ? [<Text dimColor>{file.isBinary ? 'bin' : '?'}</Text>]
        : [<Text color="success">+{file.added}</Text>, ' ', <Text color="error">-{file.removed}</Text>]

    return (
      <Box flexDirection="column">
        {!isRepo && <Text dimColor>Not in a git repository.</Text>}
        {isRepo && files.length === 0 && <Text dimColor>No change against HEAD.</Text>}
        {files.slice(0, room).map(file => (
          <Button
            key={file.path}
            plain
            onPress={() => $.prompt.fill({ text: `@${relativeTo(cwd, file.path)} `, mode: 'insert' })}
          >
            {lines(file)} {relativeTo(cwd, file.path)}
            <Text dimColor>{file.kind === 'modified' ? '' : ` ${file.kind}`}</Text>
          </Button>
        ))}
        {files.length > room && <Text dimColor>…and {files.length - room} more</Text>}
        {files.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>
              {files.length} files · +{added} -{removed} · press a file to mention it
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
