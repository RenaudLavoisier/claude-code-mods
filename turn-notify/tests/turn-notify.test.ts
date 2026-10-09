import { expect, test } from 'claude-code/testing'

import { formatDuration, summaryOf } from '../hooks/notify'

const turn = (durationMs: number, extra: Record<string, unknown> = {}) => ({
  answer: '## Summary\n\n**Fixed** the flaky test in `tests_ut_orders.py`.',
  durationMs,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...extra,
})

test('summary keeps the first line with words, without Markdown', () => {
  expect(summaryOf('## Summary\n\n**Fixed** it')).toBe('Summary')
  expect(summaryOf('')).toBe('')
  expect(formatDuration(134_000)).toBe('2m14s')
})

test('only a long main turn notifies', async ($, on) => {
  const notices: string[] = []
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.notify', ($, e) => (notices.push(e.text), { value: { isSent: true, channel: 'iterm2' } }))

  await $.turn.complete(turn(30_000))
  await $.turn.complete(turn(90_000, { agentId: 'agent-1' }))
  await $.turn.complete(turn(90_000, { isAborted: true, reason: 'aborted' }))
  expect(notices).toEqual([])

  await $.turn.complete(turn(134_000))
  expect(notices).toEqual(['Done in 2m14s: Summary'])

  await $.turn.complete(turn(61_000, { reason: 'error' }))
  expect(notices.at(-1)).toBe('Turn failed after 1m01s')
})
