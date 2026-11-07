/** `goal` namespace dictionaries. */

/** English dictionary (the key-set source of truth). */
export const en = {
  'phase.active':      'Ongoing Goal',
  'phase.paused':      'Paused Goal',
  'phase.blocked':     'Blocked Goal',
  'objective.aria':    'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save':       'Save goal',
  'action.cancel':     'Cancel edit',
  'action.pause':      'Pause goal',
  'action.resume':     'Resume goal',
  'action.edit':       'Edit goal',
  'action.clear':      'Clear goal',
} satisfies Record<string, string>

/** The namespace key union. */
export type GoalKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'phase.active':      'Meta en curso',
  'phase.paused':      'Meta en pausa',
  'phase.blocked':     'Meta bloqueada',
  'objective.aria':    'Objetivo de la meta',
  'commandInput.aria': 'Entrada de comando',
  'action.save':       'Guardar meta',
  'action.cancel':     'Cancelar edición',
  'action.pause':      'Pausar meta',
  'action.resume':     'Reanudar meta',
  'action.edit':       'Editar meta',
  'action.clear':      'Borrar meta',
} satisfies Record<GoalKey, string>
