/** `sidebar` namespace dictionaries: shell controls (brand row, New Session, fold toggle). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'session.new':       'New Session',
  'session.new.label': 'New session',
  'toggle.open':       'Open sidebar',
  'toggle.collapse':   'Collapse sidebar',
} satisfies Record<string, string>

/** The namespace key union. */
export type SidebarKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'session.new':       'Nueva sesión',
  'session.new.label': 'Nueva sesión',
  'toggle.open':       'Abrir barra lateral',
  'toggle.collapse':   'Contraer barra lateral',
} satisfies Record<SidebarKey, string>
