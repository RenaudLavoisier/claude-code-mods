import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { changesOf, kindOf, parseNumstat, parseStatus, relativeTo } from '../hooks/files'

const PANE = {
  component: 'Pane',
  requestId: 'changed-files',
  props: {
    title: 'Changed files',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const DIFF = '3\t1\tapp/x.py\0-\t-\timg.png\0' + '0\t4\told.py\0'
const STATUS = ' M app/x.py\0M  img.png\0D  old.py\0'

// Answers git as a repository at /repo with the changes above would, and records each call.
function git(on: On, repo: { isRepo?: boolean; diff?: string; status?: string } = {}) {
  const calls: string[] = []
  on('process.run', ($, e) => {
    const args = e.argv.slice(2).join(' ')
    calls.push(args)
    const answer = (exitCode: number, stdout = '') => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (args === 'rev-parse --show-toplevel') return repo.isRepo === false ? answer(128) : answer(0, '/repo\n')
    if (args.startsWith('rev-parse --verify')) return answer(0, 'abc\n')
    if (args.startsWith('diff HEAD')) return answer(0, repo.diff ?? DIFF)
    if (args.startsWith('status')) return answer(0, repo.status ?? STATUS)

    return answer(1)
  })
  on('session.cwd', () => ({ value: '/repo' }))

  return calls
}

test('helpers', () => {
  expect(relativeTo('/repo', '/repo/app/x.py')).toBe('app/x.py')
  expect(kindOf('A ')).toBe('added')
  expect(kindOf(' D')).toBe('deleted')
  expect(kindOf('MM')).toBe('modified')

  const counts = parseNumstat(DIFF)
  expect(counts.get('app/x.py')).toEqual({ added: 3, removed: 1, isBinary: false })
  expect(counts.get('img.png')).toEqual({ added: null, removed: null, isBinary: true })

  expect(changesOf('/repo', counts, parseStatus(STATUS)).map(file => [file.path, file.kind])).toEqual([
    ['/repo/app/x.py', 'modified'],
    ['/repo/img.png', 'modified'],
    ['/repo/old.py', 'deleted'],
  ])
})

test('the pane lists what git diff shows, on every surface', async ($, on) => {
  const calls = git(on)
  on('tool.call', () => ({ result: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.clock(on)

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'a', new_string: 'b' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'changed-files', surface, ...PANE })
    const rows = await ui.findAll({ type: 'Button' })
    expect(rows.map(row => row.key)).toEqual(['/repo/app/x.py', '/repo/img.png', '/repo/old.py'])
    expect(await ui.find({ type: 'Text', text: /3 files · \+3 -5/ })).toBeDefined()
    await ui.unmount()
  }
  expect(calls).toContain('status --porcelain=v1 -z --untracked-files=no --no-renames')
})

test('a tool that changes no file does not read git', async ($, on) => {
  const calls = git(on)
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Read', file_path: '/repo/app/x.py' })
  expect(calls).toHaveLength(0)
})

test('outside a git repository the pane says so', async ($, on) => {
  git(on, { isRepo: false })
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Not in a git repository/ })).toBeDefined()
})

test('a narrow terminal points to /changes, once', async ($, on) => {
  const toasts: string[] = []
  git(on)
  on('tool.call', () => ({ result: {} }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'unasked below 144 columns (now 120)' } }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  mock.clock(on)

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'b', new_string: 'c' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/\/changes/)
})

test('while open, the pane follows changes made outside the session', async ($, on) => {
  let diff = DIFF
  const calls: string[] = []
  on('process.run', ($, e) => {
    const args = e.argv.slice(2).join(' ')
    calls.push(args)
    const stdout = args.startsWith('rev-parse --show') ? '/repo\n' : args.startsWith('diff') ? diff : args.startsWith('status') ? '' : 'abc\n'

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on)

  await $.command.run({
    command: 'changes',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  diff = ''
  await clock.advance(5_000)

  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /No change against HEAD/ })).toBeDefined()
})
