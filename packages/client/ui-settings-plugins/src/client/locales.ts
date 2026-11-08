/** Locale bundles for the plugin configuration section and its plugin cards. */

/** Locale keys these surfaces render. */
export type PluginsSettingsLocaleKey =
  | 'nav' | 'title' | 'intro' | 'tabs' | 'configurableTab' | 'empty'
  | 'overridden' | 'reset' | 'readOnly' | 'expand' | 'collapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed' | 'invalidNumber'
  | 'bashTitle' | 'bashDescription' | 'bashTimeoutMs' | 'bashTimeoutMsHint'
  | 'bashMaxOutputBytes' | 'bashMaxOutputBytesHint'
  | 'agentLoopTitle' | 'agentLoopDescription' | 'agentLoopMaxParallel' | 'agentLoopMaxParallelHint'
  | 'webSearchTitle' | 'webSearchDescription'
  | 'webSearchApiKey' | 'webSearchApiKeyHint' | 'webSearchApiKeySet' | 'webSearchApiKeyUnset'
  | 'webSearchBaseUrl' | 'webSearchBaseUrlHint' | 'webSearchMaxUses' | 'webSearchMaxUsesHint'

/** English dictionary. */
export const en = {
  'nav':                      'Plugins',
  'title':                    'Plugins',
  'intro':                    'Configure and inspect the plugins installed in this deployment.',
  'tabs':                     'Plugin views',
  'configurableTab':          'Plugin configuration',
  'empty':                    'This deployment exposes no plugin settings.',
  'overridden':               'Overridden',
  'reset':                    'Reset to default',
  'readOnly':                 'This deployment stores settings read-only.',
  'expand':                   'Show settings',
  'collapse':                 'Hide settings',
  'save':                     'Save',
  'saving':                   'Saving…',
  'discard':                  'Discard',
  'unsaved':                  'Unsaved',
  'saveFailed':               'The deployment did not accept these values; they were left for you to correct.',
  'invalidNumber':            'Enter a number, or leave blank to use the default.',
  'bashTitle':                'Shell',
  'bashDescription':          'Limits every command the agent runs.',
  'bashTimeoutMs':            'Command timeout (ms)',
  'bashTimeoutMsHint':        'How long one command may run before it is terminated.',
  'bashMaxOutputBytes':       'Output cap per stream (bytes)',
  'bashMaxOutputBytesHint':   'Output beyond this spills to a temporary file rather than being lost.',
  'agentLoopTitle':           'Agent loop',
  'agentLoopDescription':     'How the agent dispatches tool calls.',
  'agentLoopMaxParallel':     'Parallel tool calls',
  'agentLoopMaxParallelHint': 'Upper bound on parallel-safe calls running at once within one step.',
  'webSearchTitle':           'Web search',
  'webSearchDescription':     'The DeepSeek search provider.',
  'webSearchApiKey':          'API key',
  'webSearchApiKeyHint':      'Stored outside the settings file. Leave blank to keep the current key.',
  'webSearchApiKeySet':       'A key is configured.',
  'webSearchApiKeyUnset':     'No key is configured; search is unavailable until one is.',
  'webSearchBaseUrl':         'Endpoint',
  'webSearchBaseUrlHint':     'Leave blank to use the provider default.',
  'webSearchMaxUses':         'Max searches per request',
  'webSearchMaxUsesHint':     'How many times one request may search before it must answer.',
} satisfies Record<PluginsSettingsLocaleKey, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'nav':                      'Plugins',
  'title':                    'Plugins',
  'intro':                    'Configurá e inspeccioná los plugins instalados en este despliegue.',
  'tabs':                     'Vistas de plugins',
  'configurableTab':          'Configuración de plugins',
  'empty':                    'Este despliegue no expone configuración de plugins.',
  'overridden':               'Sobrescrito',
  'reset':                    'Restablecer',
  'readOnly':                 'Este despliegue guarda la configuración en solo lectura.',
  'expand':                   'Mostrar configuración',
  'collapse':                 'Ocultar configuración',
  'save':                     'Guardar',
  'saving':                   'Guardando…',
  'discard':                  'Descartar',
  'unsaved':                  'Sin guardar',
  'saveFailed':               'El despliegue no aceptó estos valores; quedaron para que los corrijas.',
  'invalidNumber':            'Escribí un número, o dejalo vacío para usar el predeterminado.',
  'bashTitle':                'Shell',
  'bashDescription':          'Limita cada comando que ejecuta el agente.',
  'bashTimeoutMs':            'Tiempo límite por comando (ms)',
  'bashTimeoutMsHint':        'Cuánto puede durar un comando antes de terminarlo.',
  'bashMaxOutputBytes':       'Tope de salida por flujo (bytes)',
  'bashMaxOutputBytesHint':   'La salida que exceda este tope pasa a un archivo temporal en lugar de perderse.',
  'agentLoopTitle':           'Ciclo del agente',
  'agentLoopDescription':     'Cómo despacha el agente las llamadas a herramientas.',
  'agentLoopMaxParallel':     'Llamadas paralelas',
  'agentLoopMaxParallelHint': 'Máximo de llamadas seguras en paralelo ejecutándose a la vez dentro de un paso.',
  'webSearchTitle':           'Búsqueda web',
  'webSearchDescription':     'El proveedor de búsqueda de DeepSeek.',
  'webSearchApiKey':          'Clave de API',
  'webSearchApiKeyHint':      'Se guarda fuera del archivo de configuración. Dejala vacía para mantener la clave actual.',
  'webSearchApiKeySet':       'Hay una clave configurada.',
  'webSearchApiKeyUnset':     'No hay ninguna clave configurada; la búsqueda no está disponible hasta que la haya.',
  'webSearchBaseUrl':         'Endpoint',
  'webSearchBaseUrlHint':     'Dejalo vacío para usar el valor predeterminado del proveedor.',
  'webSearchMaxUses':         'Búsquedas máximas por solicitud',
  'webSearchMaxUsesHint':     'Cuántas veces puede buscar una solicitud antes de tener que responder.',
} satisfies Record<PluginsSettingsLocaleKey, string>
