import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/styles/design-platform.css', import.meta.url)), 'utf8')

/**
 * WCAG relative luminance from an opaque hex color.
 * @param hex - six-digit hex color.
 * @returns relative luminance in [0, 1].
 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

/**
 * WCAG contrast ratio between two opaque hex colors.
 * @param foreground - six-digit foreground hex color.
 * @param background - six-digit background hex color.
 * @returns the contrast ratio.
 */
function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter! + 0.05) / (darker! + 0.05)
}

describe('MDL-HARNESS brand palette', () => {
  it('maps the primary brand red through the shared static scale', () => {
    expect(css.match(/--dsw-static-deepseek-500: rgb\(212, 0, 0\);/g)).toHaveLength(2)
    expect(css).toContain('--dsw-alias-brand-primary: var(--dsw-static-deepseek-500);')
    expect(css).toContain('--dsw-alias-brand-text: var(--dsw-static-deepseek-500);')
    expect(css).toContain('--dsw-alias-button-primary-hover: var(--dsw-static-deepseek-600);')
  })

  it('uses neutral graphite surfaces without blue tint', () => {
    expect(css.match(/--dsw-static-neutral-bluish-950: rgb\(17, 17, 19\);/g)).toHaveLength(2)
    expect(css).toContain('--dsw-alias-bg-base: var(--dsw-static-neutral-bluish-60);')
    expect(css).toContain('--dsw-alias-bg-base: var(--dsw-static-neutral-bluish-950);')
    expect(css).toContain('--dsw-specific-sidebar-fill: var(--dsw-static-neutral-bluish-900);')
  })

  it('keeps a lighter brand accent in dark mode and preserves semantic state colors', () => {
    expect(css).toContain('--dsw-alias-brand-primary: var(--dsw-static-deepseek-400);')
    expect(css).toContain('--dsw-alias-brand-text: var(--dsw-static-deepseek-300);')
    expect(css).toContain('--dsw-alias-state-warn-primary: var(--dsw-static-amber-500);')
    expect(css).toContain('--dsw-alias-state-success-primary: var(--dsw-static-green-500);')
  })

  it('carries error states on fuchsia in light mode and yellow in dark mode', () => {
    expect(css).toContain('--dsw-alias-state-error-primary: var(--dsw-static-fuchsia-600);')
    expect(css).toContain('--dsw-alias-state-error-secondary: var(--dsw-static-fuchsia-500);')
    expect(css.match(/--dsw-alias-state-error-(?:primary|secondary): var\(--dsw-static-yellow-400\);/g)).toHaveLength(2)
  })

  it('retains AA contrast for primary text and primary button pairs', () => {
    expect(contrast('#D40000', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#18181B', '#F4F4F5')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#FF6363', '#18181B')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#FFA0A0', '#111113')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#C026D3', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#FACC15', '#18181B')).toBeGreaterThanOrEqual(4.5)
  })
})
