/**
 * The common-namespace dictionary pair. English is the source of truth for the
 * key set; Spanish is checked complete against it — a missing or extra key is a
 * compile error.
 */
export { en } from './en.ts'
export { es } from './es.ts'
export type { CommonKey } from './en.ts'
