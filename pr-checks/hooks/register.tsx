import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Check, CheckBucket, PullRequest, Snapshot } from '../types'

const snapshot = atom({ plugin: 'pr-checks', key: 'snapshot' } as const, null)
const hasOpened = atom({ plugin: 'pr-checks', key: 'hasOpened' } as const, false)

const PANE = 'pr-checks'
const TITLE = 'PR checks'
// While a check runs or after a branch change, gh is read every TICK_MS; else every IDLE_REFRESH_MS.
const TICK_MS = 30_000
const IDLE_REFRESH_MS = 120_000
const BUCKETS: readonly CheckBucket[] = ['pass', 'fail', 'pending', 'skipping', 'cancel']
// Failing checks first, then running, passed and skipped.
const ORDER: readonly CheckBucket[] = ['fail', 'cancel', 'pending', 'pass', 'skipping']
const MARKS: Record<CheckBucket, string> = {
  fail: '✗',
  cancel: '⊘',
  pending: '●',
  pass: '✓',
  skipping: '○',
}
const COLORS: Record<CheckBucket, 'error' | 'warning' | 'success' | undefined> = {
  fail: 'error',
  cancel: 'error',
  pending: 'warning',
  pass: 'success',
  skipping: undefined,
}

type Counts = Record<CheckBucket, number>

function countChecks(checks: readonly Check[]): Counts {
  const counts: Counts = { pass: 0, fail: 0, pending: 0, skipping: 0, cancel: 0 }
  for (const check of checks) counts[check.bucket] += 1
  return counts
}

function sortChecks(checks: readonly Check[]): Check[] {
  return ORDER.flatMap(bucket => checks.filter(one => one.bucket === bucket))
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}

function parseChecks(stdout: string): Check[] {
  const rows: unknown = JSON.parse(stdout)
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({
    name: String(row?.name ?? ''),
    bucket: BUCKETS.includes(row?.bucket) ? row.bucket : 'pending',
    link: String(row?.link ?? ''),
  }))
}

async function currentBranch($: EngineInterface): Promise<string> {
  const git = await $.process.run(['git', 'branch', '--show-current'])
  return git.exitCode === 0 ? git.stdout.trim() : ''
}

async function fetchSnapshot($: EngineInterface): Promise<Snapshot> {
  const updatedAt = await $.clock.now()
  const branch = await currentBranch($)
  if (branch === '') return { branch, pr: null, checks: [], error: null, updatedAt }

  const view = await $.process.run(['gh', 'pr', 'view', '--json', 'number,title,url,state'])
  if (view.exitCode !== 0) {
    const isMissing = /no pull requests found/i.test(view.stderr)
    return { branch, pr: null, checks: [], error: isMissing ? null : firstLine(view.stderr), updatedAt }
  }
  const pr = JSON.parse(view.stdout) as PullRequest

  // gh exits 1 when a check failed and 8 while one is pending: stdout still holds the JSON.
  const run = await $.process.run(['gh', 'pr', 'checks', String(pr.number), '--json', 'name,bucket,link'])
  if (run.stdout.trim() === '') {
    const isEmpty = /no checks reported/i.test(run.stderr)
    return { branch, pr, checks: [], error: isEmpty ? null : firstLine(run.stderr), updatedAt }
  }

  return { branch, pr, checks: parseChecks(run.stdout), error: null, updatedAt }
}

function announce($: EngineInterface, previous: Snapshot | null, current: Snapshot): void {
  if (!previous?.pr || !current.pr || previous.pr.number !== current.pr.number) return
  const before = countChecks(previous.checks)
  const after = countChecks(current.checks)
  if (before.pending === 0 || after.pending > 0) return

  const failed = after.fail + after.cancel
  $.ui.toast(
    failed === 0
      ? `PR #${current.pr.number}: all checks passed`
      : `PR #${current.pr.number}: ${failed} check${failed > 1 ? 's' : ''} failed`,
  )
}

function describeSnapshot(current: Snapshot | null): string {
  if (current === null) return 'PR checks: not loaded yet.'
  if (current.pr === null) {
    return current.error ?? `No pull request for branch ${current.branch || '(detached HEAD)'}.`
  }

  const { pr, checks } = current
  const counts = countChecks(checks)
  const lines = [
    `PR #${pr.number} ${pr.title} (${pr.state.toLowerCase()}) ${pr.url}`,
    `${counts.pass} passed, ${counts.fail} failed, ${counts.cancel} cancelled, ${counts.pending} pending, ${counts.skipping} skipped`,
  ]
  for (const check of sortChecks(checks)) {
    lines.push(`${MARKS[check.bucket]} ${check.name}${check.link ? ` ${check.link}` : ''}`)
  }
  if (current.error !== null) lines.push(`(last refresh failed: ${current.error})`)

  return lines.join('\n')
}

// Opened unasked once per session, the first time the branch has a pull request.
async function openOnce($: EngineInterface): Promise<void> {
  if (await read($, hasOpened)) return
  await update($, hasOpened, () => true)

  // Opened unasked, the pane waits undrawn below 144 columns: point to /pr-checks.
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  if (!opened.isPlaced) {
    $.ui.toast('Terminal too narrow to open the PR checks pane: type /pr-checks to see it', {
      timeoutMs: 10_000,
    })
  }
}

let isRefreshing = false

async function refresh($: EngineInterface): Promise<void> {
  if (isRefreshing) return
  isRefreshing = true
  try {
    const previous = await read($, snapshot)
    let current: Snapshot
    try {
      current = await fetchSnapshot($)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      current = previous
        ? { ...previous, error: message }
        : { branch: '', pr: null, checks: [], error: message, updatedAt: await $.clock.now() }
    }
    await update($, snapshot, () => current)
    announce($, previous, current)
    if (current.pr !== null) await openOnce($)
  } finally {
    isRefreshing = false
  }
}

async function tick($: EngineInterface): Promise<void> {
  const current = await read($, snapshot)
  if (current === null) return refresh($)

  const isPending = countChecks(current.checks).pending > 0
  const isOld = (await $.clock.now()) - current.updatedAt >= IDLE_REFRESH_MS
  if (isPending || isOld || (await currentBranch($)) !== current.branch) {
    await refresh($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pr-checks',
      description: 'Show the checks of the current branch pull request in a pane',
    })
    $.clock.after(1, () => void refresh($))
    $.clock.every(TICK_MS, () => void tick($))

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    $.clock.after(1, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'pr-checks' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: describeSnapshot(await read($, snapshot)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const current = await read($, snapshot)
    const refreshButton = (
      <Button key="refresh" plain onPress={() => refresh($)}>
        <Text dimColor>↻ refresh</Text>
      </Button>
    )

    if (current === null) return <Text dimColor>Reading the checks…</Text>
    if (current.pr === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>
            {current.error ?? `No pull request for branch ${current.branch || '(detached HEAD)'}.`}
          </Text>
          <Box marginTop={1}>{refreshButton}</Box>
        </Box>
      )
    }

    const { pr, checks } = current
    const counts = countChecks(checks)
    const failed = counts.fail + counts.cancel

    return (
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Link href={pr.url} label={`PR #${pr.number}`} />
          {pr.state !== 'OPEN' && <Text color="merged">{pr.state.toLowerCase()}</Text>}
        </Box>
        <Text dimColor wrap="truncate">
          {pr.title}
        </Text>
        <Box columnGap={1} marginBottom={1}>
          {checks.length === 0 && <Text dimColor>No checks.</Text>}
          {counts.pass > 0 && <Text color="success">✓ {counts.pass}</Text>}
          {failed > 0 && <Text color="error">✗ {failed}</Text>}
          {counts.pending > 0 && <Text color="warning">● {counts.pending}</Text>}
          {counts.skipping > 0 && <Text dimColor>○ {counts.skipping}</Text>}
        </Box>
        {sortChecks(checks).map(check => (
          <Box columnGap={1}>
            <Text color={COLORS[check.bucket]} dimColor={check.bucket === 'skipping'}>
              {MARKS[check.bucket]}
            </Text>
            {check.link ? <Link href={check.link} label={check.name} /> : <Text>{check.name}</Text>}
          </Box>
        ))}
        {current.error !== null && (
          <Box marginTop={1}>
            <Text dimColor>Last refresh failed: {current.error}</Text>
          </Box>
        )}
        <Box marginTop={1}>{refreshButton}</Box>
      </Box>
    )
  })
}
