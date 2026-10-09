import { expect, test } from 'claude-code/testing'

import { countLines, record, relativeTo } from '../hooks/files'

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

test('helpers', () => {
  expect(countLines('')).toBe(0)
  expect(countLines('a\nb\n')).toBe(2)
  expect(relativeTo('/repo', '/repo/app/x.py')).toBe('app/x.py')

  const once = record([], { path: '/a', added: 2, removed: 1, isNew: false })
  const twice = record(once, { path: '/a', added: 1, removed: 0, isNew: false })
  expect(twice).toEqual([{ path: '/a', added: 3, removed: 1, isNew: false, edits: 2 }])
})

test('edits fill the pane on every surface', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', () => ({ value: 'one\ntwo\n' }))

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'a', new_string: 'b\nc' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/app/y.py', content: 'x\ny\nz\n' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'q', new_string: 'r' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/app/z.py' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'changed-files', surface, ...PANE })
    const rows = await ui.findAll({ type: 'Button' })
    expect(rows.map(row => row.key)).toEqual(['/repo/app/x.py', '/repo/app/y.py'])
    expect(await ui.find({ type: 'Text', text: /2 files · \+6 -4/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a refused edit is not listed', async ($, on) => {
  on('tool.call', () => ({ deny: 'no' }))
  on('session.cwd', () => ({ value: '/repo' }))

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'a', new_string: 'b' })
  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /No file changed yet/ })).toBeDefined()
})

test('a narrow terminal points to /changes', async ($, on) => {
  const toasts: string[] = []
  on('tool.call', () => ({ result: {} }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'unasked below 144 columns (now 120)' } }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/app/x.py', old_string: 'b', new_string: 'c' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/\/changes/)
})
