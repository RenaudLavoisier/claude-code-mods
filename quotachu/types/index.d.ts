export type QuotaWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    quotachu: { windows: QuotaWindow[]; isHidden: boolean; wasStarving: boolean }
  }
}
