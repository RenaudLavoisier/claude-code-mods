import { expect, test } from 'claude-code/testing'

import { drawPet, petColor } from '../hooks/pet'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const PET = {
  command: 'pet',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

const measure = (percent: number) => ({
  context: { percent, tokens: percent * 2000, window: 200_000 },
  rateLimits: [],
  changed: ['context' as const],
})

test('pet starts small and green, then grows and turns red', () => {
  expect(drawPet(0, '^_^')).toEqual([' /\\_/\\ ', '( ^_^ )', ' \\___/ '])
  expect(petColor(0)).toBe('#20df20')
  expect(petColor(100)).toBe('#df2020')

  const big = drawPet(100, 'x_x')
  expect(big).toHaveLength(8)
  expect(big[1]).toHaveLength(23)
})

test('band follows the context fill on every surface', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.session.measure(measure(10))
    const ui = await $.ui.mount({ plugin: 'context-pet', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /10% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '(  ^_^  )' })).toBeDefined()

    await $.session.measure(measure(95))
    expect(await ui.find({ type: 'Text', text: /95% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /x_x/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /190k \/ 200k tokens/ })).toBeDefined()
    await ui.unmount()
  }
})

test('/pet hides and shows the pet', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.run', () => ({ text: 'engine' }))
  await $.session.measure(measure(30))

  const hidden = await $.command.run(PET)
  expect(hidden?.text).toMatch(/nap/)

  const shown = await $.command.run(PET)
  expect(shown?.text).toMatch(/back/)
})

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 }

const stepUsing = (input: number) => async function* () {
  return {
    turnId: 't1',
    index: 0,
    answer: '',
    toolUses: [],
    stopReason: 'tool_use' as const,
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: input,
      output_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }
}

test('pet grows after each model response of the turn', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('turn.step', stepUsing(120_000))

  const ui = await $.ui.mount({ plugin: 'context-pet', surface: 'terminal', ...BAND })
  for await (const _ of $.turn.step(STEP)) {
    // drain the stream
  }

  expect(await ui.find({ type: 'Text', text: /60% of context/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /120k \/ 200k tokens/ })).toBeDefined()
  await ui.unmount()
})

test('a subagent step leaves the pet alone', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('turn.step', stepUsing(180_000))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(10))

  const ui = await $.ui.mount({ plugin: 'context-pet', surface: 'terminal', ...BAND })
  for await (const _ of $.turn.step({ ...STEP, agentId: 'agent-1' })) {
    // drain the stream
  }

  expect(await ui.find({ type: 'Text', text: /· 10% of context/ })).toBeDefined()
  await ui.unmount()
})
