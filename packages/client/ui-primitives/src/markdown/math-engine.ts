/**
 * The lazy KaTeX engine.
 *
 * KaTeX renders every TeX node in a message, and its parser plus the font
 * metrics it carries are the largest single block of the shell's `vendor`
 * chunk (36.7% of that chunk's source bytes when this was measured). Nothing
 * before the first formula needs it, so the engine arrives through a dynamic
 * import the first time a math node renders: the node paints its TeX source
 * meanwhile, and subscribers re-render once the engine is in.
 *
 * The import is started on demand and shared; {@link mathLoadCount} is the
 * version subscribers read, mirroring the lazy-grammar contract in
 * `highlight.ts`.
 * @module @deepseek-ai/dsh-client-ui-primitives/markdown/math-engine
 */

/** KaTeX's module face (its default export is the engine). */
type MathEngine = typeof import('katex').default

/**
 * Build-time URL of the engine artifact. The shell build emits KaTeX's
 * self-contained ESM file as its own asset and substitutes this constant; the
 * unit tests substitute a `file:` URL, so both take the same runtime import and
 * no bundler ever sees a specifier it could fold into an eager chunk.
 */
declare const __DSH_MATH_ENGINE_URL__: string

/**
 * The engine URL as a call, not a constant: a bundler that folded the
 * substitution back into a literal specifier would try to resolve it as a
 * module and fail the build instead of leaving a runtime import.
 * @returns the emitted artifact's URL.
 */
const engineUrl = (): string => __DSH_MATH_ENGINE_URL__

let engine: MathEngine | undefined
let loading: Promise<void> | undefined
let loads = 0
const listeners = new Set<() => void>()

/**
 * Subscribe to the engine's arrival (the `useSyncExternalStore` contract).
 * @param listener - called once the engine resolves.
 * @returns the unsubscriber.
 */
export function subscribeMathLoaded(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Engine arrivals so far, for the `useSyncExternalStore` snapshot.
 * @returns 0 while the engine is unloaded, 1 once it has arrived.
 */
export function mathLoadCount(): number {
  return loads
}

/**
 * The resolved engine, for the `useSyncExternalStore` snapshot.
 * @returns the engine once it has loaded, or undefined while it is loading.
 */
export function mathEngine(): MathEngine | undefined {
  return engine
}

/**
 * Start the engine import, or join the one already in flight.
 * @returns resolves once the engine is available; a failed import leaves the
 * engine absent and resolves anyway, so a caller never blocks a render on it.
 */
export function loadMathEngine(): Promise<void> {
  // `@vite-ignore`: the specifier comes from the build's substitution at
  // runtime, so the bundler must leave it alone.
  loading ??= import(/* @vite-ignore */ engineUrl())
    .then((module: { default: MathEngine }) => {
      engine = module.default
      loads += 1
      for (const listener of listeners) listener()
    })
    .catch(() => {
      // A failed import leaves math on the plain-source fallback; the rest of
      // the message still renders.
    })
  return loading
}
