import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const PR = { number: 42, title: 'Add thing', url: 'https://github.com/o/r/pull/42', state: 'OPEN' }

const PANE = {
  component: 'Pane',
  requestId: 'pr-checks',
  props: {
    title: 'PR checks',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const CHECKS = [
  { name: 'build', bucket: 'pass', link: 'https://github.com/o/r/actions/runs/3' },
  { name: 'tests', bucket: 'pending', link: 'https://github.com/o/r/actions/runs/2' },
  { name: 'lint', bucket: 'fail', link: 'https://github.com/o/r/actions/runs/1' },
]

function output(exitCode: number, stdout: string, stderr = ''): ProcessRunResult {
  return { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false }
}

type Host = { view?: ProcessRunResult; checks: () => ProcessRunResult; isPlaced?: boolean }

// Answers git and gh as a branch with pull request #42 would, and records the panes opened and the toasts.
function answerHost(on: On, host: Host) {
  const opened: string[] = []
  const toasts: string[] = []
  on('process.run', ($, e) => {
    const [command, , verb] = e.argv
    if (command === 'git') return { value: output(0, 'feature/x\n') }
    if (verb === 'view') return { value: host.view ?? output(0, JSON.stringify(PR)) }
    if (verb === 'checks') return { value: host.checks() }
    throw new Error(`unexpected command ${e.argv.join(' ')}`)
  })
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: host.isPlaced === false ? { isPlaced: false, reason: 'unasked below 144 columns' } : { isPlaced: true } }
  })
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))

  return { opened, toasts }
}

const COMMAND = {
  command: 'pr-checks',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

test('the pane lists the checks, failing first, on every surface', async ($, on) => {
  mock.clock(on)
  const host = answerHost(on, { checks: () => output(1, JSON.stringify(CHECKS)) })

  const listed = await $.command.run(COMMAND)
  expect(listed.text).toContain('PR #42 Add thing')
  expect(listed.text).toContain('✗ lint https://github.com/o/r/actions/runs/1')
  expect(host.opened).toContain('pr-checks')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pr-checks', surface, ...PANE })
    expect(await ui.find({ type: 'Link', text: 'PR #42' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✗ 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '● 1' })).toBeDefined()
    const names = (await ui.findAll({ type: 'Link' })).map(link => link.text)
    expect(names).toEqual(['PR #42', 'lint', 'tests', 'build'])
    await ui.unmount()
  }
})

test('the refresh button reads the checks again', async ($, on) => {
  mock.clock(on)
  let checks = CHECKS
  answerHost(on, { checks: () => output(checks.some(c => c.bucket === 'pending') ? 8 : 0, JSON.stringify(checks)) })

  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ plugin: 'pr-checks', surface: 'terminal', ...PANE })
  checks = CHECKS.map(check => ({ ...check, bucket: 'pass' }))
  await ui.press({ key: 'refresh' })

  expect(await ui.find({ type: 'Text', text: '✓ 3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✗ 1' })).toBeUndefined()
  await ui.unmount()
})

test('a toast says when the running checks are done', async ($, on) => {
  mock.clock(on)
  let checks = CHECKS
  const host = answerHost(on, { checks: () => output(0, JSON.stringify(checks)) })

  await $.command.run(COMMAND)
  checks = CHECKS.map(check => (check.bucket === 'pending' ? { ...check, bucket: 'pass' } : check))
  await $.command.run(COMMAND)

  expect(host.toasts).toEqual(['PR #42: 1 check failed'])
})

test('without a pull request the pane says so and does not open by itself', async ($, on) => {
  const clock = mock.clock(on)
  const host = answerHost(on, {
    view: output(1, '', 'no pull requests found for branch "feature/x"'),
    checks: () => output(0, '[]'),
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  expect(host.opened).toEqual([])

  const ui = await $.ui.mount({ plugin: 'pr-checks', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'No pull request for branch feature/x.' })).toBeDefined()
  await ui.unmount()
})

test('the pane opens by itself once, and a narrow terminal points to /pr-checks', async ($, on) => {
  const clock = mock.clock(on)
  const host = answerHost(on, { checks: () => output(0, JSON.stringify(CHECKS)), isPlaced: false })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  await clock.advance(120_000)

  expect(host.opened).toEqual(['pr-checks'])
  expect(host.toasts).toHaveLength(1)
  expect(host.toasts[0]).toMatch(/\/pr-checks/)
})
