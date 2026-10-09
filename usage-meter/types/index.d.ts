export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { windows: UsageWindow[]; alerted: Record<string, number> }
  }
}
