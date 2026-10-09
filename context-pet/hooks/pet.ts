export const NAME = 'Tokachu'

const clamp = (percent: number) => Math.min(100, Math.max(0, percent))

const toHex = (value: number) =>
  Math.round(value * 255)
    .toString(16)
    .padStart(2, '0')

// Hue slides from green (120) at 0% to red (0) at 100%.
export function petColor(percent: number): string {
  const hue = 120 * (1 - clamp(percent) / 100)
  const s = 0.75
  const l = 0.5
  const k = (n: number) => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))

  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

export function petFace(percent: number): string {
  if (percent < 40) return '^_^'
  if (percent < 60) return 'o_o'
  if (percent < 80) return 'O_O'
  if (percent < 90) return '>_<'

  return 'x_x'
}

export function petMood(percent: number): string {
  if (percent < 40) return 'feeling great'
  if (percent < 60) return 'well fed'
  if (percent < 80) return 'bloated'
  if (percent < 90) return 'about to burst'

  return 'about to explode, try /compact'
}

// Width grows from 5 to 21 inner cells and the belly from 0 to 5 rows.
export function drawPet(percent: number, face: string, maxRows = Infinity): string[] {
  const fill = clamp(percent) / 100
  const inner = 5 + 2 * Math.round(fill * 8)
  const bellyRows = Math.max(0, Math.min(Math.floor(fill * 5), maxRows - 3))
  const side = ' '.repeat((inner - face.length) / 2)

  return [
    ` /\\${'_'.repeat(inner - 4)}/\\ `,
    `(${side}${face}${side})`,
    ...Array.from({ length: bellyRows }, () => `(${' '.repeat(inner)})`),
    ` \\${'_'.repeat(inner - 2)}/ `,
  ]
}

export function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : `${tokens}`
}
