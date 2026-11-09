import type { QuotaWindow } from '../types'

export const NAME = 'Quotachu'

export const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 86_400_000,
}

// Points of usage ahead of the time elapsed at which the pet turns fully red.
const RED_AHEAD = 20

const clamp = (percent: number) => Math.min(100, Math.max(0, percent))

const toHex = (value: number) =>
  Math.round(value * 255)
    .toString(16)
    .padStart(2, '0')

export type QuotaReading = {
  used: number
  left: number
  // Share of the window's time already gone, null when the reset time is unknown.
  elapsed: number | null
  // 0 on pace or behind it, 100 at RED_AHEAD points ahead (or, without a reset
  // time, the used share itself): drives the color, the face and the mood.
  strain: number
  resetsInMs: number | null
  // Time until the window is used up at the current rate, null when that
  // comes after the reset.
  emptyInMs: number | null
}

export function readQuota(window: QuotaWindow, now: number): QuotaReading {
  const used = clamp(Math.round(window.percentUsed))
  const windowMs = WINDOW_MS[window.kind]
  const resetsAt = window.resetsAt === undefined ? NaN : Date.parse(window.resetsAt)
  const resetsInMs = Number.isNaN(resetsAt) ? null : Math.max(0, resetsAt - now)

  if (resetsInMs === null || windowMs === undefined) {
    return { used, left: 100 - used, elapsed: null, strain: used, resetsInMs, emptyInMs: null }
  }

  const elapsedMs = Math.max(0, windowMs - resetsInMs)
  const elapsed = clamp(Math.round((elapsedMs * 100) / windowMs))
  const strain = clamp(((used - elapsed) * 100) / RED_AHEAD)
  const emptyInMs =
    used > 0 && used < 100 && elapsedMs > 0 ? ((100 - used) * elapsedMs) / used : null

  return {
    used,
    left: 100 - used,
    elapsed,
    strain,
    resetsInMs,
    emptyInMs: emptyInMs !== null && emptyInMs < resetsInMs ? emptyInMs : null,
  }
}

// Same palette as Tokachu: hue slides from green (120) at 0 to red (0) at 100.
export function quotaColor(strain: number): string {
  const hue = 120 * (1 - clamp(strain) / 100)
  const s = 0.75
  const l = 0.5
  const k = (n: number) => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))

  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

// Red past half the strain: more than 10 points ahead of the time elapsed.
export const isStarving = (reading: QuotaReading) => reading.used >= 100 || reading.strain > 50

export function quotaFace(reading: QuotaReading): string {
  if (reading.used >= 100) return 'x_x'
  if (isStarving(reading)) return '>_<'
  if (reading.strain > 0) return 'o_o'

  return '^w^'
}

export function quotaMood(reading: QuotaReading): string {
  if (reading.used >= 100) {
    return reading.resetsInMs === null
      ? 'out of snacks'
      : `out of snacks, back in ${formatIn(reading.resetsInMs)}`
  }
  if (isStarving(reading)) {
    return reading.emptyInMs === null ? 'starving' : `starving, empty in ~${formatIn(reading.emptyInMs)}`
  }
  if (reading.strain > 0) return 'nibbling fast'

  return 'plenty of snacks'
}

// Width shrinks from 13 to 5 inner cells and the belly from 2 rows to 0 as the
// quota left goes from 100% to 0%.
export function drawQuotaPet(left: number, face: string, maxRows = Infinity): string[] {
  const fill = clamp(left) / 100
  const inner = 5 + 2 * Math.round(fill * 4)
  const bellyRows = Math.max(0, Math.min(Math.round(fill * 2), maxRows - 3))
  const side = ' '.repeat((inner - face.length) / 2)

  return [
    ` (\\${'_'.repeat(inner - 4)}/) `,
    `(${side}${face}${side})`,
    ...Array.from({ length: bellyRows }, () => `(${' '.repeat(inner)})`),
    ` \\${'_'.repeat(inner - 2)}/ `,
  ]
}

export function formatIn(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`

  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

export function windowLine(label: string, reading: QuotaReading): string {
  const pace = reading.elapsed === null ? '' : ` / ${reading.elapsed}% of window`
  const reset = reading.resetsInMs === null ? '' : ` · resets in ${formatIn(reading.resetsInMs)}`

  return `${label} ${reading.used}% used${pace}${reset}`
}
