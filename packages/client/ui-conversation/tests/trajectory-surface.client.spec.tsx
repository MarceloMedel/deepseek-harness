// @vitest-environment jsdom
/** The deferred trajectory view: the synthetic ring tab and the wait the body renders while its row mounts. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationSessionInjected } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  TRAJECTORY_SURFACE, TRAJECTORY_VIEW_ID, TrajectorySurfacePending,
  type TrajectorySurfacePendingProps,
} from '../src/client/trajectory-surface.tsx'

afterEach(cleanup)

/** A runtime whose surface double answers `has` and records opens. */
async function bench(hasSurface: boolean) {
  const runtime = await SlotTestRuntime.create()
  // Services this plugin injects but the surface path never reads.
  runtime.provide('connection', { api: { settings: {} }, isLoopback: false })
  runtime.provide('remote', { $on: () => () => {} })
  runtime.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  runtime.provide('layout', { openDetails: () => {}, closeDetails: () => {} })
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('es')
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.root.declare({
    'conversation': { kind: 'single', scope: 'session-maybe' },
    'details': { kind: 'single', scope: 'session' },
  }, (_p: { renderSlot?: unknown }) => null)
  const opens: string[] = []
  runtime.useSurfaces({
    has: () => hasSurface,
    open: async (name: string) => { opens.push(name) },
  })
  return { runtime, opens }
}

/** The session body's injected face, read off the slot ledger. */
function sessionFace(runtime: SlotTestRuntime): ConversationSessionInjected {
  const entry = runtime.slots.entries('conversation.session')[0]!
  return (entry.inject as unknown as () => ConversationSessionInjected)()
}

describe('the deferred trajectory view', () => {
  it('offers the tab and the activation handle while its package is not mounted', async () => {
    const { runtime, opens } = await bench(true)
    const handle = await runtime.mount({ inject: [...inject], apply })
    const face = sessionFace(runtime)
    // Chat is the conversation's own view; the synthetic tab follows it.
    expect(face.views.list().map(tab => tab.id)).toEqual(['chat', TRAJECTORY_VIEW_ID])
    const pending = face.surfaceViewOf(TRAJECTORY_VIEW_ID)
    expect(pending).toBeDefined()
    await pending!.ensure()
    expect(opens).toEqual([TRAJECTORY_SURFACE])
    await handle.dispose()
    await runtime.dispose()
  })

  it('offers nothing when no row declares the surface', async () => {
    const { runtime } = await bench(false)
    const handle = await runtime.mount({ inject: [...inject], apply })
    const face = sessionFace(runtime)
    expect(face.views.list().map(tab => tab.id)).toEqual(['chat'])
    expect(face.surfaceViewOf(TRAJECTORY_VIEW_ID)).toBeUndefined()
    await handle.dispose()
    await runtime.dispose()
  })

  it('hands the tab over to the real view once its entry registers', async () => {
    const { runtime } = await bench(true)
    const handle = await runtime.mount({ inject: [...inject], apply })
    expect(sessionFace(runtime).surfaceViewOf(TRAJECTORY_VIEW_ID)).toBeDefined()
    // The row mounts after the surface opens and claims the view id.
    runtime.slots.register({ name: 'conversation.view', id: TRAJECTORY_VIEW_ID, order: 10 } as never, () => null)
    const face = sessionFace(runtime)
    expect(face.views.list().map(tab => tab.id)).toEqual(['chat', TRAJECTORY_VIEW_ID])
    expect(face.surfaceViewOf(TRAJECTORY_VIEW_ID)).toBeUndefined()
    await handle.dispose()
    await runtime.dispose()
  })
})

/** The wait's props with a translate that echoes keys. */
function props(ensureView: () => Promise<void>): TrajectorySurfacePendingProps {
  return { ensureView, t: (key: string) => key } as never
}

describe('TrajectorySurfacePending', () => {
  it('mounts the surface on mount and reports the wait', async () => {
    let release = (): void => {}
    const ensureView = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    render(<TrajectorySurfacePending {...props(ensureView)} />)
    expect(ensureView).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('loading')
    await act(async () => { release() })
    expect(screen.getByRole('status').textContent).toBe('loading')
  })

  it('reports a failed mount in the UI and in the console', async () => {
    const failure = new Error('bundle fetch failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      render(<TrajectorySurfacePending {...props(() => Promise.reject(failure))} />)
    })
    expect(consoleError).toHaveBeenCalledWith(failure)
    expect(screen.getByRole('status').textContent).toBe('load.failed')
    consoleError.mockRestore()
  })
})
