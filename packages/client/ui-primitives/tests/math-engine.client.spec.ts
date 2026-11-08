// @vitest-environment jsdom
/** The on-demand KaTeX engine: one shared import, one arrival notification, and a silent failure path. */
import { describe, expect, it, vi } from 'vitest'
import { loadMathEngine, mathEngine, mathLoadCount, subscribeMathLoaded } from '../src/markdown/math-engine.ts'

describe('the on-demand math engine', () => {
  it('resolves one shared engine and notifies subscribers once', async () => {
    expect(mathEngine()).toBeUndefined()
    expect(mathLoadCount()).toBe(0)
    let notified = 0
    const stop = subscribeMathLoaded(() => { notified += 1 })
    // Concurrent callers share the single in-flight import.
    await Promise.all([loadMathEngine(), loadMathEngine()])
    expect(mathEngine()).toBeDefined()
    expect(mathLoadCount()).toBe(1)
    expect(notified).toBe(1)
    // A later call joins the resolved import instead of loading again.
    await loadMathEngine()
    expect(mathLoadCount()).toBe(1)
    stop()
    expect(mathEngine()).toBeDefined()
  })

  it('leaves the engine absent when the artifact cannot load', async () => {
    vi.resetModules()
    const previous = (globalThis as { __DSH_MATH_ENGINE_URL__?: string }).__DSH_MATH_ENGINE_URL__
    ;(globalThis as { __DSH_MATH_ENGINE_URL__?: string }).__DSH_MATH_ENGINE_URL__ = 'file:///nonexistent/katex.mjs'
    const fresh = await import('../src/markdown/math-engine.ts')
    await fresh.loadMathEngine()
    expect(fresh.mathEngine()).toBeUndefined()
    expect(fresh.mathLoadCount()).toBe(0)
    if (previous === undefined) delete (globalThis as { __DSH_MATH_ENGINE_URL__?: string }).__DSH_MATH_ENGINE_URL__
    else (globalThis as { __DSH_MATH_ENGINE_URL__?: string }).__DSH_MATH_ENGINE_URL__ = previous
    vi.resetModules()
  })
})
