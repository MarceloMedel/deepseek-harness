/** `layout` namespace dictionaries: frame chrome that is not any feature's own (the phone menu control). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'menu.open': '打开会话列表',
} satisfies Record<string, string>

/** The layout namespace key union. */
export type LayoutKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'menu.open': 'Open sessions',
} satisfies Record<LayoutKey, string>

/** Locale namespace this package owns. */
export const NS = 'layout'
