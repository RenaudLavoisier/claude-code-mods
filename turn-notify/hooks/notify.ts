import type { TurnCompleteInput } from 'claude-code'

export const MIN_DURATION_MS = 60_000

const SUMMARY_LENGTH = 120

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`

  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

// First line of the answer that holds words, without Markdown marks.
export function summaryOf(answer: string): string {
  const line = answer
    .split('\n')
    .map(text => text.replace(/[#*`>_|-]/g, '').trim())
    .find(text => text.length > 0)

  if (line === undefined) return ''

  return line.length > SUMMARY_LENGTH ? `${line.slice(0, SUMMARY_LENGTH - 1)}…` : line
}

export function messageOf(e: TurnCompleteInput): string {
  const took = formatDuration(e.durationMs)
  if (e.reason === 'error') return `Turn failed after ${took}`
  if (e.reason === 'refusal') return `Turn refused after ${took}`

  const summary = summaryOf(e.answer)

  return summary === '' ? `Done in ${took}` : `Done in ${took}: ${summary}`
}
