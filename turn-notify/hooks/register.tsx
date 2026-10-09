import type { Register } from 'claude-code'

import { MIN_DURATION_MS, messageOf } from './notify'

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const isLongMainTurn = e.agentId === undefined && !e.isAborted && e.durationMs >= MIN_DURATION_MS

    if (isLongMainTurn) {
      await $.ui.notify(messageOf(e), { title: 'Claude Code' }).catch(() => undefined)
    }

    return done
  })
}
