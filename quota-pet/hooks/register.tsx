import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { QuotaWindow } from '../types'
import {
  NAME,
  drawQuotaPet,
  formatIn,
  isStarving,
  quotaColor,
  quotaFace,
  quotaMood,
  readQuota,
  windowLine,
} from './quota'

const windows = atom({ plugin: 'quota-pet', key: 'windows' } as const, [])
const isHidden = atom({ plugin: 'quota-pet', key: 'isHidden' } as const, false)
const wasStarving = atom({ plugin: 'quota-pet', key: 'wasStarving' } as const, false)

// The pets of this repository that draw in the band above the prompt.
const BAND_PETS: readonly string[] = ['context-pet', 'quota-pet']
const isBandPet = (plugin: string | undefined) => plugin !== undefined && BAND_PETS.includes(plugin)

const fiveHourOf = (list: readonly QuotaWindow[]) => list.find(w => w.kind === 'five_hour')

async function remember($: EngineInterface, limits: readonly SessionRateLimit[]) {
  const list: QuotaWindow[] = limits.map(({ kind, percentUsed, resetsAt }) => ({
    kind,
    percentUsed,
    resetsAt,
  }))
  await update($, windows, () => list)

  const fiveHour = fiveHourOf(list)
  const reading = fiveHour && readQuota(fiveHour, await $.clock.now())
  const starving = reading !== undefined && isStarving(reading)
  const before = await read($, wasStarving)
  await update($, wasStarving, () => starving)

  if (reading && starving && !before) {
    const reset = reading.resetsInMs === null ? '' : `, resets in ${formatIn(reading.resetsInMs)}`
    $.ui.toast(`${NAME} is starving: 5h limit at ${reading.used}%${reset}`, { timeoutMs: 8000 })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quotapet',
      description: `Show or hide ${NAME}, the usage-limit pet`,
    })
    const { rateLimits } = await $.session.usage()
    await remember($, rateLimits)
    // The pace moves with time even when the usage does not.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await remember($, e.rateLimits)
    }

    return next(e)
  })

  on('command.run', { command: 'quotapet' }, async $ => {
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
    const list = await read($, windows)
    const fiveHour = fiveHourOf(list)

    if (
      !isBandPet(e.plugin) ||
      e.props.hasSurvey ||
      fiveHour === undefined ||
      (await read($, isHidden))
    ) {
      return beneath
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const reading = readQuota(fiveHour, now)
    const sevenDay = list.find(w => w.kind === 'seven_day')
    const color = quotaColor(reading.strain)
    const lines = drawQuotaPet(reading.left, quotaFace(reading), e.props.maxRows)

    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center">
        <Box key="quotachu" flexDirection="row" alignItems="center" marginRight={4} marginTop={1}>
          <Box key="pet" flexDirection="column">
            {lines.map(line => (
              <Text color={color}>{line}</Text>
            ))}
          </Box>
          <Box key="stats" flexDirection="column" marginLeft={2}>
            <Text color={color} bold>
              {NAME} · 5h {reading.left}% left
            </Text>
            <Text dimColor>{windowLine('5h', reading)}</Text>
            {sevenDay ? [<Text dimColor>{windowLine('7d', readQuota(sevenDay, now))}</Text>] : []}
            <Text dimColor italic>
              {e.props.isWorking ? 'munch munch…' : quotaMood(reading)}
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
