// @vitest-environment node
/** Boot diagnostics: the one line each inactive entry reports, shared by the settle sweep and the surface opener. */
import { describe, expect, it } from 'vitest'
import { FIBER_STATE } from '../src/loader-status.ts'
import { entryFailure } from '../src/loader-status.ts'

/** Every service is provided unless the case says otherwise. */
const allProvided = (): boolean => true

describe('entryFailure', () => {
  it('reports nothing for an active entry', () => {
    expect(entryFailure('row', { state: FIBER_STATE.ACTIVE, inject: {} }, allProvided)).toBeUndefined()
  })

  it('names an import failure when the entry has no fiber', () => {
    expect(entryFailure('row', undefined, allProvided))
      .toBe('row: import failed (see console for the import error)')
  })

  it('reports a failed apply by state', () => {
    expect(entryFailure('row', { state: FIBER_STATE.FAILED, inject: {} }, allProvided)).toBe('row: failed')
  })

  it('lists the services a pending entry is still waiting for, singular and plural', () => {
    const inject = { slots: {}, locale: {} }
    const missingOne = (service: string): boolean => service !== 'slots'
    expect(entryFailure('row', { state: FIBER_STATE.PENDING, inject }, missingOne))
      .toBe('row: pending (waiting for service: slots)')
    expect(entryFailure('row', { state: FIBER_STATE.PENDING, inject }, () => false))
      .toBe('row: pending (waiting for services: slots, locale)')
  })

  it('falls back to an unknown wait when no declared service is missing', () => {
    expect(entryFailure('row', { state: FIBER_STATE.PENDING, inject: {} }, allProvided))
      .toBe('row: pending (waiting for services: unknown)')
  })
})
