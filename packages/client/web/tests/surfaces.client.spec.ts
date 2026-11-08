// @vitest-environment node
/** Surface activation: sequencing, sharing, retry, and the per-row diagnostics. */
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { Fiber } from '@deepseek-ai/cordis'
import type { BootPluginRow } from '@deepseek-ai/dsh-client-modules/client'
import { createSurfaceOpener, type SurfaceRowState, type SurfaceSeams } from '../src/surfaces.ts'

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

/** Typed spies over the seams, so assertions read `mock.calls` without casts. */
interface SeamsBench {
  readonly host: SurfaceSeams
  readonly prefetch: Mock<(id: string) => Promise<void>>
  readonly create: Mock<(id: string) => Promise<Fiber | undefined>>
  readonly onStatus: Mock<(id: string, state: SurfaceRowState) => void>
  readonly inactiveReason: Mock<(name: string, fiber: Fiber | undefined) => string | undefined>
}

function seams(overrides: Partial<SurfaceSeams> = {}): SeamsBench {
  const prefetch = vi.fn(async (_id: string): Promise<void> => {})
  const create = vi.fn(async (_id: string): Promise<Fiber | undefined> => fiberOf('active'))
  const inactiveReason = vi.fn((_name: string, _fiber: Fiber | undefined): string | undefined => undefined)
  const onStatus = vi.fn((_id: string, _state: SurfaceRowState): void => {})
  const host: SurfaceSeams = {
    rows: [row('boot-a'), row('settings-one', 'settings'), row('settings-two', 'settings')],
    prefetch,
    create,
    inactiveReason,
    onStatus,
    ...overrides,
  }
  return { host, prefetch, create, onStatus, inactiveReason }
}

describe('createSurfaceOpener', () => {
  it('mounts every row of the surface after registering their factories', async () => {
    const bench = seams()
    await createSurfaceOpener(bench.host).open('settings')
    // Prefetch precedes materialization for every row of the surface, and no
    // boot row is touched.
    expect(bench.prefetch.mock.calls.map(call => call[0])).toEqual(['settings-one', 'settings-two'])
    expect(bench.create.mock.calls.map(call => call[0])).toEqual(['settings-one', 'settings-two'])
    // Rows mount concurrently, so the projection is compared as a set.
    expect(bench.onStatus.mock.calls).toHaveLength(4)
    expect(new Set(bench.onStatus.mock.calls.map(call => call.join(' ')))).toEqual(new Set([
      'settings-one loading',
      'settings-one active',
      'settings-two loading',
      'settings-two active',
    ]))
  })

  it('reports whether any row declares a surface without mounting anything', () => {
    const bench = seams()
    const opener = createSurfaceOpener(bench.host)
    expect(opener.has('settings')).toBe(true)
    expect(opener.has('inspector')).toBe(false)
    expect(bench.prefetch).not.toHaveBeenCalled()
    expect(bench.create).not.toHaveBeenCalled()
  })

  it('shares one attempt between concurrent callers of the same surface', async () => {
    const bench = seams()
    const opener = createSurfaceOpener(bench.host)
    await Promise.all([opener.open('settings'), opener.open('settings')])
    expect(bench.create).toHaveBeenCalledTimes(2)
  })

  it('rejects a surface no row declares', async () => {
    const bench = seams()
    await expect(createSurfaceOpener(bench.host).open('inspector'))
      .rejects.toThrow('web boot: no client row declares the "inspector" surface')
    expect(bench.prefetch).not.toHaveBeenCalled()
  })

  it('reports every row that failed to activate, with the row named', async () => {
    const bench = seams({
      create: vi.fn(async (id: string) => (id === 'settings-one' ? undefined : fiberOf('active'))),
      inactiveReason: vi.fn((name: string, fiber: Fiber | undefined) => (fiber === undefined ? `${name}: import failed` : undefined)),
    })
    await expect(createSurfaceOpener(bench.host).open('settings'))
      .rejects.toThrow('web boot: surface "settings" did not activate\nsettings-one: import failed')
    expect(bench.onStatus).toHaveBeenCalledWith('settings-one', 'failed')
  })

  it('forgets a failed attempt so reopening the surface retries', async () => {
    const create = vi.fn(async (): Promise<Fiber | undefined> => undefined)
    const bench = seams({
      create,
      inactiveReason: vi.fn((name: string) => `${name}: import failed`),
    })
    const opener = createSurfaceOpener(bench.host)
    await expect(opener.open('settings')).rejects.toThrow('did not activate')
    await expect(opener.open('settings')).rejects.toThrow('did not activate')
    expect(create).toHaveBeenCalledTimes(4)
  })
})
