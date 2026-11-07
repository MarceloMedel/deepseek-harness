/** `layout` namespace dictionaries: frame chrome that is not any feature's own (the phone menu control). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'menu.open': 'Open sessions',
} satisfies Record<string, string>

/** The namespace key union. */
export type LayoutKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'menu.open': 'Abrir sesiones',
} satisfies Record<LayoutKey, string>

/** Locale namespace this package owns. */
export const NS = 'layout'
