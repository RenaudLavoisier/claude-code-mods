export type QuotaWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'quota-pet': { windows: QuotaWindow[]; isHidden: boolean; wasStarving: boolean }
  }
}
