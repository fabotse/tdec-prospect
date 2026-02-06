import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Regression test: Ensures all chart CSS variables remain grayscale (0% saturation).
 * Prevents accidental reintroduction of colored chart variables that would break the B&W theme.
 * Reference: Story 8.3 - Charts Grayscale Conversion
 */
describe('globals.css chart variables grayscale compliance', () => {
  const cssContent = readFileSync(
    resolve(__dirname, '../../../src/app/globals.css'),
    'utf-8'
  )

  // Match all --chart-N declarations with their hsl values
  const chartVarRegex = /--chart-(\d+):\s*hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/g

  const chartDeclarations: Array<{
    name: string
    hue: number
    saturation: number
    lightness: number
  }> = []

  let match
  while ((match = chartVarRegex.exec(cssContent)) !== null) {
    chartDeclarations.push({
      name: `--chart-${match[1]}`,
      hue: parseInt(match[2]),
      saturation: parseInt(match[3]),
      lightness: parseInt(match[4]),
    })
  }

  it('should find chart variable declarations in both themes', () => {
    // 5 chart vars × 2 themes (dark + light) = 10
    expect(chartDeclarations.length).toBe(10)
  })

  it('should have 0% saturation on all chart variables (grayscale only)', () => {
    for (const decl of chartDeclarations) {
      expect(
        decl.saturation,
        `${decl.name} has saturation ${decl.saturation}% — must be 0% for B&W theme`
      ).toBe(0)
    }
  })

  it('should have 0 hue on all chart variables', () => {
    for (const decl of chartDeclarations) {
      expect(
        decl.hue,
        `${decl.name} has hue ${decl.hue} — must be 0 for grayscale`
      ).toBe(0)
    }
  })

  it('should have distinguishable lightness values (min 15% delta between neighbors)', () => {
    // Group by chart number appearance order (first 5 = dark, last 5 = light)
    const darkCharts = chartDeclarations.slice(0, 5)
    const lightCharts = chartDeclarations.slice(5, 10)

    for (const group of [
      { name: 'dark', charts: darkCharts },
      { name: 'light', charts: lightCharts },
    ]) {
      const sorted = [...group.charts].sort(
        (a, b) => a.lightness - b.lightness
      )
      for (let i = 1; i < sorted.length; i++) {
        const delta = sorted[i].lightness - sorted[i - 1].lightness
        expect(
          delta,
          `${group.name} theme: ${sorted[i].name}(${sorted[i].lightness}%) vs ${sorted[i - 1].name}(${sorted[i - 1].lightness}%) — delta ${delta}% < 15%`
        ).toBeGreaterThanOrEqual(15)
      }
    }
  })
})
