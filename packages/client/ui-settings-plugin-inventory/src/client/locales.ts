/** Copy dictionaries for the plugin inventory Settings section. */

/** English dictionary (the key-set source of truth). */
export const en = {
  'tab':           'Plugin list',
  'loading':       'Reading plugins…',
  'error':         'Plugins are temporarily unavailable.',
  'retry':         'Retry',
  'search':        'Search plugins',
  'catalog':       'Plugin list',
  'empty':         'No plugins are available.',
  'emptySearch':   'No matching plugins.',
  'enabledTag':    'Enabled',
  'disabledTag':   'Disabled',
  'configuration': 'Configuration',
  'cordis':        'Cordis status',
  'unobserved':    'Not mounted',
  'pending':       'Waiting for dependencies',
  'loadingPhase':  'Loading',
  'active':        'Mounted',
  'failed':        'Mount failed',
  'unloading':     'Unloading',
} satisfies Record<string, string>

/** The namespace key union. */
export type PluginInventoryLocaleKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'tab':           'Lista de plugins',
  'loading':       'Leyendo plugins…',
  'error':         'Los plugins no están disponibles por ahora.',
  'retry':         'Reintentar',
  'search':        'Buscar plugins',
  'catalog':       'Lista de plugins',
  'empty':         'No hay plugins disponibles.',
  'emptySearch':   'Ningún plugin coincide.',
  'enabledTag':    'Habilitado',
  'disabledTag':   'Deshabilitado',
  'configuration': 'Configuración',
  'cordis':        'Estado de Cordis',
  'unobserved':    'Sin montar',
  'pending':       'Esperando dependencias',
  'loadingPhase':  'Cargando',
  'active':        'Montado',
  'failed':        'Falló el montaje',
  'unloading':     'Desmontando',
} satisfies Record<PluginInventoryLocaleKey, string>
