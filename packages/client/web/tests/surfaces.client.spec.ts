// @vitest-environment node
/** Surface activation: sequencing, sharing, retry, and the per-row diagnostics. */
import { describe, expect, it, vi } from 'vitest'
import type { Fiber } from '@deepseek-ai/cordis'
import type { BootPluginRow } from '@deepseek-ai/dsh-client-modules/client'
import { createSurfaceOpener, type SurfaceSeams } from '../src/surfaces.ts'

function row(id: string, surface?: string): BootPluginRow {
  return {
    id,
    inject: [],
    immediately: false,
    surface,
  }
}

/** A fiber stand-in: only `state` and `inject` reach the diagnostics. */
const fiberOf = (state: string): Fiber => ({ state, inject: {} }) as unknown as Fiber

function seams(overrides: Partial<SurfaceSeams> = {}): SurfaceSeams & {
  prefetch: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  onStatus: ReturnType<typeof vi.fn>
} {
  const base = {
    rows: [row('boot-a'), row('settings-one', 'settings'), row('settings-two', 'settings')],
    prefetch: vi.fn(async () => {}),
    create: vi.fn(async () => fiberOf('active')),
    inactiveReason: vi.fn(() => undefined),
    onStatus: vi.fn(),
    ...overrides,
  }
  return base as never
}

describe('createSurfaceOpener', () => {
  it('mounts every row of the surface after registering their factories', async () => {
    const host = seams()
    await createSurfaceOpener(host).open('settings')
    // Prefetch precedes materialization for every row of the surface, and no
    // boot row is touched.
    expect(host.prefetch.mock.calls.map(call => call[0])).toEqual(['settings-one', 'settings-two'])
    expect(host.create.mock.calls.map(call => call[0])).toEqual(['settings-one', 'settings-two'])
    // Rows mount concurrently, so the projection is compared as a set.
    expect(host.onStatus.mock.calls).toHaveLength(4)
    expect(new Set(host.onStatus.mock.calls.map(call => call.join(' ')))).toEqual(new Set([
      'settings-one loading',
      'settings-one active',
      'settings-two loading',
      'settings-two active',
    ]))
  })

  it('reports whether any row declares a surface without mounting anything', () => {
    const host = seams()
    const opener = createSurfaceOpener(host)
    expect(opener.has('settings')).toBe(true)
    expect(opener.has('inspector')).toBe(false)
    expect(host.prefetch).not.toHaveBeenCalled()
    expect(host.create).not.toHaveBeenCalled()
  })

  it('shares one attempt between concurrent callers of the same surface', async () => {
    const host = seams()
    const opener = createSurfaceOpener(host)
    await Promise.all([opener.open('settings'), opener.open('settings')])
    expect(host.create).toHaveBeenCalledTimes(2)
  })

  it('rejects a surface no row declares', async () => {
    const host = seams()
    await expect(createSurfaceOpener(host).open('inspector'))
      .rejects.toThrow('web boot: no client row declares the "inspector" surface')
    expect(host.prefetch).not.toHaveBeenCalled()
  })

  it('reports every row that failed to activate, with the row named', async () => {
    const host = seams({
      create: vi.fn(async (id: string) => (id === 'settings-one' ? undefined : fiberOf('active'))),
      inactiveReason: vi.fn((name: string, fiber: Fiber | undefined) => (fiber === undefined ? `${name}: import failed` : undefined)),
    })
    await expect(createSurfaceOpener(host).open('settings'))
      .rejects.toThrow('web boot: surface "settings" did not activate\nsettings-one: import failed')
    expect(host.onStatus).toHaveBeenCalledWith('settings-one', 'failed')
  })

  it('forgets a failed attempt so reopening the surface retries', async () => {
    const create = vi.fn(async () => undefined)
    const host = seams({
      create,
      inactiveReason: vi.fn((name: string) => `${name}: import failed`),
    })
    const opener = createSurfaceOpener(host)
    await expect(opener.open('settings')).rejects.toThrow('did not activate')
    await expect(opener.open('settings')).rejects.toThrow('did not activate')
    expect(create).toHaveBeenCalledTimes(4)
  })
})
