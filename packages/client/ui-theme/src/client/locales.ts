/** `settings.theme` namespace dictionaries (the Appearance row's copy). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'appearance.title':  'Appearance',
  'appearance.light':  'Light',
  'appearance.dark':   'Dark',
  'appearance.system': 'System',
} satisfies Record<string, string>

/** The namespace key union. */
export type ThemeKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'appearance.title':  'Apariencia',
  'appearance.light':  'Claro',
  'appearance.dark':   'Oscuro',
  'appearance.system': 'Sistema',
} satisfies Record<ThemeKey, string>
