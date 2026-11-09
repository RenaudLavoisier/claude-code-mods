import { expect, mock, test } from 'claude-code/testing'

import { drawQuotaPet, quotaColor, quotaFace, quotaMood, readQuota } from '../hooks/quota'

const NOW = Date.parse('2026-11-09T12:00:00Z')
const HOUR = 3_600_000

// A 5h window with `hoursLeft` before its reset, seen at NOW.
const fiveHour = (percentUsed: number, hoursLeft: number) => ({
  kind: 'five_hour',
  percentUsed,
  resetsAt: new Date(NOW + hoursLeft * HOUR).toISOString(),
})

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const QUOTAPET = {
  command: 'quotapet',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

// Stands for what the band holds beneath the plugin: the engine's band, or another mod's.
const beneath = (text: string) => () => ({ type: 'Text' as const, children: [text] })

test('pet starts big and shrinks as the quota is used', () => {
  expect(drawQuotaPet(0, 'x_x')).toEqual([' (\\_/) ', '( x_x )', ' \\___/ '])

  const big = drawQuotaPet(100, '^w^')
  expect(big).toHaveLength(5)
  expect(big[1]).toHaveLength(15)
  expect(drawQuotaPet(100, '^w^', 4)).toHaveLength(4)
})

test('color, face and mood follow the pace', () => {
  // 2 hours of 5 gone: 40% of the window.
  const onPace = readQuota(fiveHour(30, 3), NOW)
  expect(onPace).toMatchObject({ used: 30, left: 70, elapsed: 40, strain: 0, emptyInMs: null })
  expect(quotaColor(onPace.strain)).toBe('#20df20')
  expect(quotaFace(onPace)).toBe('^w^')
  expect(quotaMood(onPace)).toBe('plenty of snacks')

  const fast = readQuota(fiveHour(45, 3), NOW)
  expect(fast.strain).toBe(25)
  expect(quotaFace(fast)).toBe('o_o')
  expect(quotaMood(fast)).toBe('nibbling fast')

  // 80% in 2 hours: the last 20% go in 30 minutes, before the reset.
  const starving = readQuota(fiveHour(80, 3), NOW)
  expect(quotaColor(starving.strain)).toBe('#df2020')
  expect(quotaFace(starving)).toBe('>_<')
  expect(starving.emptyInMs).toBe(30 * 60_000)
  expect(quotaMood(starving)).toBe('starving, empty in ~30m')

  const empty = readQuota(fiveHour(100, 1.5), NOW)
  expect(quotaFace(empty)).toBe('x_x')
  expect(quotaMood(empty)).toBe('out of snacks, back in 1h30')
})

test('without a reset time the used share drives the color', () => {
  const reading = readQuota({ kind: 'five_hour', percentUsed: 60 }, NOW)
  expect(reading).toMatchObject({ elapsed: null, strain: 60, resetsInMs: null })
  expect(quotaFace(reading)).toBe('>_<')
  expect(quotaMood(reading)).toBe('starving')
})

test('band shows the 5h pet and the 7d line beside what lies beneath', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('ui.render', beneath('Tokachu'))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.toast', () => ({ value: undefined }))

  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [
      fiveHour(30, 3),
      { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(NOW + 50 * HOUR).toISOString() },
    ],
    changed: ['rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'quotachu', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /Quotachu · 5h 70% left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '5h 30% used / 40% of window · resets in 3h00' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '7d 41% used / 70% of window · resets in 2d2h' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '(    ^w^    )' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Tokachu' })).toBeDefined()
    await ui.unmount()
  }
})

test('without usage limits only what lies beneath is drawn', async ($, on) => {
  on('ui.render', beneath('Tokachu'))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['rateLimits'] })

  const ui = await $.ui.mount({ plugin: 'quotachu', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Quotachu/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Tokachu' })).toBeDefined()
  await ui.unmount()
})

test('turning starving raises one toast', async ($, on) => {
  const toasts: string[] = []
  mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))

  const measure = (percentUsed: number) =>
    $.session.measure({
      context: { window: 200_000 },
      rateLimits: [fiveHour(percentUsed, 3)],
      changed: ['rateLimits'],
    })

  await measure(30)
  await measure(80)
  await measure(85)
  expect(toasts).toEqual(['Quotachu is starving: 5h limit at 80%, resets in 3h00'])

  await measure(20)
  await measure(90)
  expect(toasts).toHaveLength(2)
})

test('/quotapet hides and shows the pet', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('ui.render', beneath('Tokachu'))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.run', () => ({ text: 'engine' }))
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [fiveHour(30, 3)],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({ plugin: 'quotachu', surface: 'terminal', ...BAND })
  expect((await $.command.run(QUOTAPET))?.text).toMatch(/nap/)
  expect(await ui.find({ type: 'Text', text: /Quotachu/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Tokachu' })).toBeDefined()

  expect((await $.command.run(QUOTAPET))?.text).toMatch(/back/)
  expect(await ui.find({ type: 'Text', text: /Quotachu/ })).toBeDefined()
  await ui.unmount()
})
