import type { UsageWindow } from '../types'

export const LEVELS = [80, 95] as const

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export const labelOf = (kind: string) => LABELS[kind] ?? kind

export function formatIn(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`

  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

// Highest alert level the percentage has reached, 0 below the first one.
export function levelOf(percent: number): number {
  return LEVELS.filter(level => percent >= level).at(-1) ?? 0
}

export function statusLine(windows: readonly UsageWindow[], now: number): string | undefined {
  if (windows.length === 0) return undefined

  const parts = windows.map(window => {
    const resetsAt = window.resetsAt === undefined ? NaN : Date.parse(window.resetsAt)
    const resets = Number.isNaN(resetsAt) ? '' : ` (resets in ${formatIn(resetsAt - now)})`
    const warning = window.percentUsed >= LEVELS[0] ? ' ⚠' : ''

    return `${labelOf(window.kind)} ${Math.round(window.percentUsed)}%${resets}${warning}`
  })

  return `limits ${parts.join(' · ')}`
}
