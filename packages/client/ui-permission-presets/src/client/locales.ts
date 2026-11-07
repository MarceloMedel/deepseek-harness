/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'title':               'Permission',
  'description':         'Choose the default permission mode for new sessions',
  'loading':             'Loading',
  'unavailable':         'Unavailable',
  'confirm.title':       'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel':      'Cancel',
  'confirm.enable':      'Enable Full access',
} satisfies Record<string, string>

/** The namespace key union. */
export type PermissionSettingsKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'title':               'Permisos',
  'description':         'Elegí el modo de permisos predeterminado para las sesiones nuevas',
  'loading':             'Cargando',
  'unavailable':         'No disponible',
  'confirm.title':       '¿Habilitar acceso total?',
  'confirm.description': 'El acceso total permite que las sesiones nuevas reduzcan los pasos de confirmación y hagan más acciones directamente, incluidas operaciones sensibles, cambios de archivos o comandos externos. Usalo solo cuando confíes en las tareas siguientes.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel':      'Cancelar',
  'confirm.enable':      'Habilitar acceso total',
} satisfies Record<PermissionSettingsKey, string>


/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessEn

/** Spanish dictionary for the current-session popup gate. */
export const accessEs = {
  'confirm.title': '¿Habilitar acceso total?',
  'confirm.description': 'El acceso total reduce los pasos de confirmación y permite al agente hacer más acciones directamente, incluidas operaciones sensibles, cambios de archivos o comandos externos. Usalo solo cuando confíes en la tarea actual.',
  'confirm.acknowledge': 'Entiendo los riesgos y quiero continuar',
  'confirm.cancel': 'Cancelar',
  'confirm.enable': 'Habilitar acceso total',
} satisfies Record<PermissionAccessKey, string>
