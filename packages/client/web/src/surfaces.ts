/**
 * Surface activation: the kernel-side half of the row-level activation
 * contract. A graph row whose package declares `dsh.client.surface` is not a
 * boot row, so the only path that materializes it is a feature opening that
 * surface — see `@deepseek-ai/dsh-client-ui-slots` for the consumer contract.
 *
 * This module owns the sequencing and the diagnostics; the kernel supplies the
 * Loader, the module transport, and the status projection as seams, which keeps
 * the mechanism testable without a browser.
 * @module @deepseek-ai/dsh-client-web/surfaces
 */
import type { Fiber } from '@deepseek-ai/cordis'
import type { BootPluginRow } from '@deepseek-ai/dsh-client-modules/client'
import type { ClientSurfaces } from '@deepseek-ai/dsh-client-ui-slots'

/** Per-row activation state the shell's loading page projects. */
export type SurfaceRowState = 'loading' | 'active' | 'failed'

/** The Loader, module transport, and diagnostics a surface opener drives. */
export interface SurfaceSeams {
  /** Every graph row, in composition order (surface rows are filtered per call). */
  rows: readonly BootPluginRow[]
  /**
   * Register a bundle's factory before its entry materializes. Failures are the
   * import path's to report, so this seam resolves regardless.
   * @param id - graph row id (package name).
   */
  prefetch: (id: string) => Promise<void>
  /**
   * Create the Loader entry for one row and await its root fiber.
   * @param id - graph row id (package name).
   * @returns the entry's root fiber, or undefined when its import failed.
   */
  create: (id: string) => Promise<Fiber | undefined>
  /**
   * The failure line for one row, or undefined when it is serving.
   * @param name - entry name for the diagnostic.
   * @param fiber - the row's root fiber, absent when its import failed.
   */
  inactiveReason: (name: string, fiber: Fiber | undefined) => string | undefined
  /**
   * Project one row's activation state onto the shell's status store.
   * @param id - graph row id (package name).
   * @param state - the state to display.
   */
  onStatus: (id: string, state: SurfaceRowState) => void
}

/**
 * Build the surface activation service over the kernel's Loader seams.
 * @param seams - Loader, module transport, and status projection.
 * @returns the service the kernel provides as `ctx.clientSurfaces`.
 */
export function createSurfaceOpener(seams: SurfaceSeams): ClientSurfaces {
  const openings = new Map<string, Promise<void>>()
  const mount = async (name: string, rows: readonly BootPluginRow[]): Promise<void> => {
    // Same rule as the boot tier: a bundle's factory must be registered before
    // any dependent entry materializes, and only that row's import reports the
    // failure loudly.
    await Promise.all(rows.map(row => seams.prefetch(row.id)))
    const failures: string[] = []
    await Promise.all(rows.map(async (row) => {
      seams.onStatus(row.id, 'loading')
      const fiber = await seams.create(row.id)
      const reason = seams.inactiveReason(row.id, fiber)
      seams.onStatus(row.id, reason === undefined ? 'active' : 'failed')
      if (reason !== undefined) failures.push(reason)
    }))
    if (failures.length > 0) {
      throw new Error(`web boot: surface "${name}" did not activate\n${failures.join('\n')}`)
    }
  }
  return {
    has: (name: string): boolean => seams.rows.some(row => row.surface === name),
    open: (name: string): Promise<void> => {
      const existing = openings.get(name)
      if (existing !== undefined) return existing
      const rows = seams.rows.filter(row => row.surface === name)
      if (rows.length === 0) {
        return Promise.reject(new Error(`web boot: no client row declares the "${name}" surface`))
      }
      const opening = mount(name, rows)
      openings.set(name, opening)
      // A failed attempt must not poison the next one: a transient fetch error
      // is exactly what reopening the surface fixes.
      void opening.catch(() => { openings.delete(name) })
      return opening
    },
  }
}
