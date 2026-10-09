import { expect, test } from 'claude-code/testing'

import { formatIn, levelOf, statusLine } from '../hooks/meter'

const HOUR = 3_600_000

test('status line shows each window with its reset countdown', () => {
  const now = Date.parse('2026-10-09T10:00:00Z')
  const line = statusLine(
    [
      { kind: 'five_hour', percentUsed: 41.5, resetsAt: '2026-10-09T12:10:00Z' },
      { kind: 'seven_day', percentUsed: 82, resetsAt: '2026-10-12T14:00:00Z' },
    ],
    now,
  )

  expect(line).toBe('limits 5h 42% (resets in 2h10) · 7d 82% (resets in 3d4h) ⚠')
  expect(statusLine([], now)).toBeUndefined()
  expect(formatIn(25 * 60_000)).toBe('25m')
  expect(formatIn(HOUR)).toBe('1h00')
})

test('alert levels', () => {
  expect(levelOf(79.9)).toBe(0)
  expect(levelOf(80)).toBe(80)
  expect(levelOf(97)).toBe(95)
})

test('a window crossing 80% raises one toast, 95% also a notification', async ($, on) => {
  const toasts: string[] = []
  const notices: string[] = []
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.notify', ($, e) => (notices.push(e.text), { value: { isSent: true, channel: 'iterm2' } }))
  on('ui.status', () => ({ value: undefined }))

  const measure = (percentUsed: number) =>
    $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed }],
      changed: ['rateLimits'],
    })

  await measure(50)
  await measure(81)
  await measure(85)
  expect(toasts).toEqual(['5h usage limit at 81%'])
  expect(notices).toEqual([])

  await measure(96)
  expect(toasts).toHaveLength(2)
  expect(notices).toEqual(['5h usage limit at 96%'])
})
