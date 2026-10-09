import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { UsageWindow } from '../types'
import { labelOf, levelOf, statusLine } from './meter'

const windows = atom({ plugin: 'usage-meter', key: 'windows' } as const, [])
const alerted = atom({ plugin: 'usage-meter', key: 'alerted' } as const, {})

async function show($: EngineInterface) {
  $.ui.status(statusLine(await read($, windows), await $.clock.now()))
}

async function remember($: EngineInterface, limits: readonly SessionRateLimit[]) {
  const list: UsageWindow[] = limits.map(({ kind, percentUsed, resetsAt }) => ({
    kind,
    percentUsed,
    resetsAt,
  }))
  await update($, windows, () => list)

  const before = await read($, alerted)
  const after: Record<string, number> = {}
  for (const window of list) {
    const level = levelOf(window.percentUsed)
    after[window.kind] = level

    if (level > (before[window.kind] ?? 0)) {
      const text = `${labelOf(window.kind)} usage limit at ${Math.round(window.percentUsed)}%`
      $.ui.toast(text, { timeoutMs: 8000 })
      if (level >= 95) {
        await $.ui.notify(text, { title: 'Claude Code usage' }).catch(() => undefined)
      }
    }
  }
  await update($, alerted, () => after)

  await show($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const { rateLimits } = await $.session.usage()
    await remember($, rateLimits)
    // Keeps the "resets in" countdown fresh between measures.
    $.clock.every(60_000, () => void show($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await remember($, e.rateLimits)
    }

    return next(e)
  })
}
