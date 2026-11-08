/** `question` namespace dictionaries. */

/** English dictionary (the key-set source of truth). */
export const en = {
  'error.incomplete':   'Please complete this question first.',
  'error.unanswered':   'Please select an option or enter a custom answer.',
  'nav.prev':           'Previous question',
  'nav.next':           'Next question',
  'nav.cancel':         'Dismiss all questions',
  'option.recommended': 'Recommended',
  'custom.placeholder': 'Type your answer',
  'action.skip':        'Skip this question',
  'action.next':        'Next',
  'plan.header':        'Plan review',
  'plan.approve':       'Approve',
  'plan.decline':       'Refuse',
  'plan.discuss':       'Chat about it',
} satisfies Record<string, string>

/** The namespace key union. */
export type QuestionKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'error.incomplete':   'Completá esta pregunta primero.',
  'error.unanswered':   'Elegí una opción o escribí una respuesta propia.',
  'nav.prev':           'Pregunta anterior',
  'nav.next':           'Pregunta siguiente',
  'nav.cancel':         'Descartar todas las preguntas',
  'option.recommended': 'Recomendada',
  'custom.placeholder': 'Escribí tu respuesta',
  'action.skip':        'Saltar esta pregunta',
  'action.next':        'Siguiente',
  'plan.header':        'Revisión del plan',
  'plan.approve':       'Aprobar',
  'plan.decline':       'Rechazar',
  'plan.discuss':       'Conversar al respecto',
} satisfies Record<QuestionKey, string>
