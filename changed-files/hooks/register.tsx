import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallInput } from 'claude-code'

import { countLines, record, relativeTo } from './files'
import type { Change } from './files'

const PANE = 'changed-files'
const TITLE = 'Changed files'

const files = atom({ plugin: 'changed-files', key: 'files' } as const, [])

// What the call will change, or null for a tool that changes no file.
async function changeOf($: EngineInterface, e: ToolCallInput): Promise<Change | null> {
  if (e.tool === 'Edit') {
    return {
      path: e.file_path,
      added: countLines(e.new_string),
      removed: countLines(e.old_string),
      isNew: false,
    }
  }

  if (e.tool === 'Write') {
    const before = await $.fs.read(e.file_path).catch(() => null)

    return {
      path: e.file_path,
      added: countLines(e.content),
      removed: typeof before === 'string' ? countLines(before) : 0,
      isNew: before === null,
    }
  }

  if (e.tool === 'NotebookEdit') {
    return { path: e.notebook_path, added: countLines(e.new_source), removed: 0, isNew: false }
  }

  return null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changes',
      description: 'Show the files changed in this session (/changes clear empties the list)',
    })

    return next(e)
  })

  on('command.run', { command: 'changes' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await update($, files, () => [])

      return { text: 'Changed files list cleared.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Changed files pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const change = await changeOf($, e).catch(() => null)
    if (change === null) {
      return next(e)
    }

    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const list = await update($, files, list => record(list, change))
      if (list.length === 1 && list[0]?.edits === 1) {
        // Opened unasked, the pane waits undrawn below 144 columns: point to /changes.
        const opened = await $.ui.open({ id: PANE, title: TITLE })
        if (!opened.isPlaced) {
          $.ui.toast('Terminal too narrow to open the pane: type /changes to see the changed files', {
            timeoutMs: 10_000,
          })
        }
      }
    }

    return ran
  }).catch(($, e, next) => next(e)) // A failure here never runs the tool twice: next replays.

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, files)
    const cwd = await $.session.cwd()
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)
    const added = list.reduce((sum, file) => sum + file.added, 0)
    const removed = list.reduce((sum, file) => sum + file.removed, 0)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No file changed yet.</Text>}
        {list.slice(0, room).map(file => (
          <Button
            key={file.path}
            plain
            onPress={() => $.prompt.fill({ text: `@${relativeTo(cwd, file.path)} `, mode: 'insert' })}
          >
            <Text color="success">+{file.added}</Text> <Text color="error">-{file.removed}</Text>{' '}
            {relativeTo(cwd, file.path)}
            <Text dimColor>
              {file.isNew ? ' new' : ''}
              {file.edits > 1 ? ` ×${file.edits}` : ''}
            </Text>
          </Button>
        ))}
        {list.length > room && <Text dimColor>…and {list.length - room} more</Text>}
        {list.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>
              {list.length} files · +{added} -{removed} · press a file to mention it
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
