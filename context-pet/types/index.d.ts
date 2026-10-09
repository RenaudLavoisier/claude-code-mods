export type PetReading = { percent: number; tokens: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'context-pet': { reading: PetReading | null; isHidden: boolean }
  }
}
