/** Locale bundles for the agent-preset settings row, hero chip, header label, and management section. */

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'title' | 'description' | 'loading' | 'error' | 'userTrust' | 'seatHint' | 'headerHint'
  | 'nav' | 'sectionIntro' | 'builtIn' | 'setDefault' | 'view'
  | 'presetStandardName' | 'presetStandardDescription'
  | 'presetCodeName' | 'presetCodeDescription'
  | 'presetMinimalName' | 'presetMinimalDescription'
  | 'presetCordisName' | 'presetCordisDescription'
  | 'duplicate' | 'duplicateUnavailable' | 'delete' | 'presetId' | 'presetIdPlaceholder' | 'copyOf'
  | 'displayName' | 'displayNamePlaceholder'
  | 'inUse' | 'noDescription' | 'builtInGroup' | 'customGroup'
  | 'brokenBadge' | 'brokenNoCopy'
  | 'composition' | 'cancel' | 'close' | 'retry'
  | 'copyTitle' | 'copyIntro' | 'create' | 'creating' | 'creatorDraft'
  | 'openLocation' | 'showLocation' | 'revealedPathLabel'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'

/** English dictionary. */
export const en = {
  'title':                     'Agent preset',
  'description':               'Applies to sessions you start from now on. Running sessions keep the preset they began with.',
  'loading':                   'Loading presets…',
  'error':                     'Could not load agent presets.',
  'userTrust':                 'Custom',
  'seatHint':                  'Agent preset for the session you are about to start',
  'headerHint':                'The agent preset this session runs, fixed when it started',
  'nav':                       'Agent presets',
  'sectionIntro':              'A preset is the plugin composition one session\'s agent runs — its tools, prompt, and capabilities. ' + 'Duplicate an existing one and make it yours, or let the agent draft one for you in Creator mode.',
  'builtIn':                   'Built-in',
  'setDefault':                'Set as default',
  'view':                      'View',
  'presetStandardName':        'Standard mode',
  'presetStandardDescription': 'Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.',
  'presetCodeName':            'Code mode',
  'presetCodeDescription':     'All Standard mode capabilities, with tools exposed through the Code Mode SDK so the model can combine multi-step operations in one TypeScript program.',
  'presetMinimalName':         'Minimal mode',
  'presetMinimalDescription':  'Two-tool coding agent with persistent bash and str_replace_editor.',
  'presetCordisName':          'Creator mode',
  'presetCordisDescription':   'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',
  'duplicate':                 'Duplicate',
  'duplicateUnavailable':      'This deployment has no writable preset directory',
  'delete':                    'Delete',
  'presetId':                  'Identifier',
  'presetIdPlaceholder':       'my-agent',
  'displayName':               'Name',
  'displayNamePlaceholder':    'Shown in the picker; defaults to the identifier',
  'inUse':                     'In use',
  'builtInGroup':              'Built-in',
  'customGroup':               'Custom',
  'noDescription':             'No description.',
  'brokenBadge':               'Failed to load',
  'brokenNoCopy':              'A preset that failed to load cannot be duplicated',
  'copyOf':                    'Copied from',
  'composition':               'Composition (agent.cordis.yml)',
  'cancel':                    'Cancel',
  'close':                     'Close',
  'retry':                     'Retry',
  'copyTitle':                 'Duplicate preset',
  'copyIntro':                 'The whole preset is copied on this machine. The identifier becomes its directory name and cannot ' + 'be changed later; everything else is edited in the preset\'s own files.',
  'create':                    'Create',
  'creating':                  'Creating…',
  'creatorDraft':              'Draft a custom preset with Creator mode',
  'openLocation':              'Open folder',
  'showLocation':              'Show location',
  'revealedPathLabel':         'Preset files:',
  'idRequired':                'Give the preset an identifier.',
  'idInvalid':                 'Use lowercase letters, digits, and hyphens, starting with a letter or digit.',
  'idTaken':                   'A preset with this identifier already exists.',
  'deleteTitle':               'Delete this preset?',
  'deleteDescription':         'The preset directory is deleted. Sessions already running on it keep working; new sessions cannot select it.',
  'deleteConfirm':             'Delete',
  'deleting':                  'Deleting…',
} satisfies Record<AgentPresetSettingsKey, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'title':                     'Preset de agente',
  'description':               'Se aplica a las sesiones que inicies de ahora en más. Las sesiones en curso conservan el preset con el que empezaron.',
  'loading':                   'Cargando presets…',
  'error':                     'No se pudieron cargar los presets de agente.',
  'userTrust':                 'Personalizado',
  'seatHint':                  'Preset de agente para la sesión que estás por iniciar',
  'headerHint':                'El preset de agente que corre esta sesión, fijado cuando empezó',
  'nav':                       'Presets de agente',
  'sectionIntro':              'Un preset es la composición de plugins que ejecuta el agente de una sesión: sus herramientas, su prompt y sus capacidades. Duplicá uno existente y hacelo tuyo, o pedile al agente que redacte uno en el modo Creador.',
  'builtIn':                   'Incluido',
  'setDefault':                'Usar como predeterminado',
  'view':                      'Ver',
  'presetStandardName':        'Modo estándar',
  'presetStandardDescription': 'Agente de programación completo, con edición de archivos, shell, búsqueda de archivos y web, habilidades, planificación, metas, subagentes y flujos de trabajo.',
  'presetCodeName':            'Modo código',
  'presetCodeDescription':     'Todas las capacidades del modo estándar, con las herramientas expuestas a través del SDK de modo código para que el modelo combine operaciones de varios pasos en un solo programa TypeScript.',
  'presetMinimalName':         'Modo mínimo',
  'presetMinimalDescription':  'Agente de programación de dos herramientas, con bash persistente y str_replace_editor.',
  'presetCordisName':          'Modo creador',
  'presetCordisDescription':   'Pensado para crear presets de agente propios, con todas las capacidades del modo estándar más inspección del runtime, experimentos con plugins y guía para escribir presets.',
  'duplicate':                 'Duplicar',
  'duplicateUnavailable':      'Este despliegue no tiene un directorio de presets escribible',
  'delete':                    'Eliminar',
  'presetId':                  'Identificador',
  'presetIdPlaceholder':       'mi-agente',
  'displayName':               'Nombre',
  'displayNamePlaceholder':    'Se muestra en el selector; por defecto usa el identificador',
  'inUse':                     'En uso',
  'builtInGroup':              'Incluidos',
  'customGroup':               'Personalizados',
  'noDescription':             'Sin descripción.',
  'brokenBadge':               'No se pudo cargar',
  'brokenNoCopy':              'Un preset que no se pudo cargar no se puede duplicar',
  'copyOf':                    'Copiado de',
  'composition':               'Composición (agent.cordis.yml)',
  'cancel':                    'Cancelar',
  'close':                     'Cerrar',
  'retry':                     'Reintentar',
  'copyTitle':                 'Duplicar preset',
  'copyIntro':                 'El preset completo se copia en esta máquina. El identificador pasa a ser el nombre de su directorio y no se puede cambiar después; el resto se edita en los archivos del propio preset.',
  'create':                    'Crear',
  'creating':                  'Creando…',
  'creatorDraft':              'Redactar un preset propio con el modo Creador',
  'openLocation':              'Abrir carpeta',
  'showLocation':              'Mostrar ubicación',
  'revealedPathLabel':         'Archivos del preset:',
  'idRequired':                'Dale un identificador al preset.',
  'idInvalid':                 'Usá letras minúsculas, dígitos y guiones, empezando con una letra o un dígito.',
  'idTaken':                   'Ya existe un preset con este identificador.',
  'deleteTitle':               '¿Eliminar este preset?',
  'deleteDescription':         'Se elimina el directorio del preset. Las sesiones que ya lo usan siguen funcionando; las sesiones nuevas no pueden elegirlo.',
  'deleteConfirm':             'Eliminar',
  'deleting':                  'Eliminando…',
} satisfies Record<AgentPresetSettingsKey, string>

/** Preset roster fields needed to resolve Web display copy. */
export interface PresetDisplaySource {
  /** Stable preset id. */
  readonly id: string
  /** Whether the deployment ships the preset or the user owns it. */
  readonly trust: 'system' | 'user'
  /** Unlocalized name published by the preset. */
  readonly name?: string
  /** Unlocalized description published by the preset. */
  readonly description?: string
}

/** Display copy resolved for the active Web locale. */
export interface PresetDisplayText {
  /** Localized built-in name or the preset's own fallback name. */
  readonly name: string
  /** Localized built-in description or the preset's own description. */
  readonly description?: string
}

interface PresetLocaleKeys {
  readonly name: AgentPresetSettingsKey
  readonly description: AgentPresetSettingsKey
}

const BUILT_IN_PRESET_KEYS: Readonly<Partial<Record<string, PresetLocaleKeys>>> = {
  standard: { name: 'presetStandardName', description: 'presetStandardDescription' },
  code: { name: 'presetCodeName', description: 'presetCodeDescription' },
  minimal: { name: 'presetMinimalName', description: 'presetMinimalDescription' },
  cordis: { name: 'presetCordisName', description: 'presetCordisDescription' },
}

/**
 * Resolve preset display copy without making user-authored metadata translatable.
 * @param preset - roster row whose copy is being rendered.
 * @param t - active Web locale lookup.
 * @returns localized copy for a known shipped preset, otherwise file metadata.
 */
export function presetDisplayText(
  preset: PresetDisplaySource,
  t: (key: AgentPresetSettingsKey) => string,
): PresetDisplayText {
  const keys = preset.trust === 'system' ? BUILT_IN_PRESET_KEYS[preset.id] : undefined
  if (keys !== undefined) return { name: t(keys.name), description: t(keys.description) }
  return {
    name: preset.name ?? preset.id,
    ...preset.description === undefined ? {} : { description: preset.description },
  }
}
