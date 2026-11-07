/** `skill` namespace dictionaries for the dedicated tool row. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** English dictionary (the key-set source of truth). */
export const en = {
  'row.running':      'Loading skill',
  'row.failed':       'Skill load failed',
  'row.stopped':      'Skill load stopped',
  'row.instructions': 'Instructions',
  'menu.userOnly':    'user-only',
} satisfies Record<string, string>

/** The namespace key union. */
export type SkillKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'row.running':      'Cargando habilidad',
  'row.failed':       'Falló la carga de la habilidad',
  'row.stopped':      'Carga de la habilidad detenida',
  'row.instructions': 'Instrucciones',
  'menu.userOnly':    'solo usuario',
} satisfies Record<SkillKey, string>
