/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** English dictionary (the key-set source of truth). */
export const en = {
  'trigger':            'Settings',
  'title':              'Settings',
  'close':              'Close',
  'openDocument':       'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav':        'General',
} satisfies Record<string, string>

/** The namespace key union. */
export type SettingsKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'trigger':            'Configuración',
  'title':              'Configuración',
  'close':              'Cerrar',
  'openDocument':       'Abrir archivo de configuración',
  'openDocument.error': 'No se pudo abrir el archivo de configuración',
  'general.nav':        'General',
} satisfies Record<SettingsKey, string>
