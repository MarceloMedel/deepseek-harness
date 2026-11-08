// @vitest-environment node
/** Boot manifest wire validation: the fields the shell acts on before any entry exists. */
import { describe, expect, it } from 'vitest'
import { parseBootManifest } from '../src/client/manifest.ts'

/** One minimal graph wire around the given rows. */
const wire = (...entries: unknown[]): unknown => ({ rev: 'r1', entries })

/** One graph row with the mandatory fields. */
const row = (extra: Record<string, unknown> = {}): unknown => ({
  id: '@fixture/row',
  url: '/plugins/@fixture/row/client.js?rev=abc',
  rev: 'abc',
  ...extra,
})

describe('parseBootManifest', () => {
  it('normalizes the optional fields and keeps surface rows distinguishable from boot rows', () => {
    const manifest = parseBootManifest(wire(
      row(),
      row({ id: '@fixture/settings', surface: 'settings', inject: ['@fixture/row'] }),
    ))
    expect(manifest.plugins).toEqual([
      { id: '@fixture/row', inject: [], immediately: false, surface: undefined },
      {
        id: '@fixture/settings',
        inject: ['@fixture/row'],
        immediately: false,
        surface: 'settings',
      },
    ])
  })

  it('rejects a surface that is not a non-empty string', () => {
    expect(() => parseBootManifest(wire(row({ surface: 7 }))))
      .toThrow('surface must be a non-empty string')
    expect(() => parseBootManifest(wire(row({ surface: '' }))))
      .toThrow('surface must be a non-empty string')
  })

  it('rejects a row that is both a surface row and an immediate prefetch row', () => {
    expect(() => parseBootManifest(wire(row({ surface: 'settings', immediately: true }))))
      .toThrow('cannot be both immediately and a surface row')
  })
})
