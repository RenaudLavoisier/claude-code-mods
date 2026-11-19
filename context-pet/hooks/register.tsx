import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { PetReading } from '../types'
import { NAME, drawPet, formatTokens, petColor, petFace, petMood } from './pet'

const reading = atom({ plugin: 'context-pet', key: 'reading' } as const, null)
const isHidden = atom({ plugin: 'context-pet', key: 'isHidden' } as const, false)

// The pets of this repository that draw in the band above the prompt.
const BAND_PETS: readonly string[] = ['context-pet', 'quota-pet']
const isBandPet = (plugin: string | undefined) => plugin !== undefined && BAND_PETS.includes(plugin)

const ALERT_PERCENT = 80

async function remember($: EngineInterface, context: SessionContextUsage) {
  const before = await read($, reading)
  const now: PetReading = {
    percent: context.percent ?? 0,
    tokens: context.tokens ?? 0,
    window: context.window,
  }
  await update($, reading, () => now)

  if ((before?.percent ?? 0) < ALERT_PERCENT && now.percent >= ALERT_PERCENT) {
    $.ui.toast(`${NAME} ate too much: ${now.percent}% of context`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: `Show or hide ${NAME}, the context pet`,
    })
    const { context } = await $.session.usage()
    await remember($, context)

    return next(e)
  })

  // Main-thread steps only: a subagent's request fills its own context, not ours.
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)

    if (e.agentId === undefined && step.usage !== null) {
      try {
        const { context } = await $.session.usage()
        const tokens =
          step.usage.input_tokens +
          step.usage.cache_read_input_tokens +
          step.usage.cache_creation_input_tokens
        const percent = context.window > 0 ? Math.round((tokens / context.window) * 100) : 0
        await remember($, { window: context.window, tokens, percent })
      } catch {
        // The end-of-turn measure still updates the pet.
      }
    }

    return step
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await remember($, e.context)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, reading, () => null)
    }

    return next(e)
  })

  on('command.run', { command: 'pet' }, async $ => {
    const hidden = await update($, isHidden, value => !value)

    return { text: hidden ? `${NAME} is taking a nap.` : `${NAME} is back.` }
  })

  // Claude Code asks the band for one row per plugin and stacks the rows. So
  // each pet draws itself into the row of every band pet, beside what that row
  // holds beneath, and the AbovePromptList hook below keeps the first of those
  // rows only: the pets share one row in either load order, and a narrow band
  // wraps them.
  on('ui.render', { component: 'AbovePrompt', plugin: '*' }, async ($, e, next) => {
    const beneath = await next(e)

    if (!isBandPet(e.plugin) || e.props.hasSurvey || (await read($, isHidden))) {
      return beneath
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, reading)
    const percent = now?.percent ?? 0
    const color = petColor(percent)
    const lines = drawPet(percent, petFace(percent), e.props.maxRows)
    const detail = now
      ? `${formatTokens(now.tokens)} / ${formatTokens(now.window)} tokens`
      : 'has not eaten anything yet'

    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center">
        <Box key="tokachu" flexDirection="row" alignItems="center" marginRight={4} marginTop={1}>
          <Box key="pet" flexDirection="column">
            {lines.map(line => (
              <Text color={color}>{line}</Text>
            ))}
          </Box>
          <Box key="stats" flexDirection="column" marginLeft={2}>
            <Text color={color} bold>
              {NAME} · {percent}% of context
            </Text>
            <Text dimColor>{detail}</Text>
            <Text dimColor italic>
              {e.props.isWorking ? 'nom nom…' : petMood(percent)}
            </Text>
          </Box>
        </Box>
        {beneath}
      </Box>
    )
  })

  // Every band pet's row holds all the pets, so keep the first of those rows.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    const first = e.props.rows.findIndex(row => isBandPet(row.plugin))
    const rows = e.props.rows.filter((row, index) => index === first || !isBandPet(row.plugin))

    return next({ ...e, props: { ...e.props, rows } })
  })
}
