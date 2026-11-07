/** `command` namespace dictionaries (the popupSelect shell's copy). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'search.placeholder': 'Search…',
  'search.aria':        'Filter options',
  'status.loading':     'Loading options…',
  'status.applying':    'Applying…',
  'status.empty':       'No options',
  'overlay.aria':       '/{command} options',
  'listbox.aria':       '/{command} matches',
} satisfies Record<string, string>

/** The namespace key union. */
export type CommandKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'search.placeholder': 'Buscar…',
  'search.aria':        'Filtrar opciones',
  'status.loading':     'Cargando opciones…',
  'status.applying':    'Aplicando…',
  'status.empty':       'Sin opciones',
  'overlay.aria':       'Opciones de /{command}',
  'listbox.aria':       'Coincidencias de /{command}',
} satisfies Record<CommandKey, string>
