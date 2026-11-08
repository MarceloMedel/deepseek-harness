/**
 * `slash.menu` namespace dictionaries: group titles keyed by source name
 * (the lookup chain returns the key itself, so an unknown source shows its
 * raw name), the pending row, and the listbox aria label.
 */

/** English dictionary (the key-set source of truth). */
export const en = {
  'command':          'Commands',
  'skill':            'Skills',
  'subagent':         'Subagents',
  'loading':          'Loading…',
  'suggestions.aria': 'Trigger suggestions',
} satisfies Record<string, string>

/** The namespace key union. */
export type MenuKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'command':          'Comandos',
  'skill':            'Habilidades',
  'subagent':         'Subagentes',
  'loading':          'Cargando…',
  'suggestions.aria': 'Sugerencias de activación',
} satisfies Record<MenuKey, string>
