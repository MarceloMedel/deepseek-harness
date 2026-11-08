/** `feedback` namespace dictionaries. */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The per-message feedback controls' copy. */
    feedback: MessageFeedbackKey
  }
}

/** English dictionary (the key-set source of truth). */
export const en = {
  'action.like':          'Good response',
  'action.likeActive':    'Remove rating',
  'action.dislike':       'Bad response',
  'action.dislikeActive': 'Remove rating',
  'note.open':            'Add a note',
  'note.placeholder':     'What was good, or what went wrong? (optional)',
  'note.save':            'Save',
  'note.cancel':          'Cancel',
  'note.aria':            'Feedback note',
  'error.conflict':       'This feedback changed elsewhere; the latest state is shown',
  'error.load':           'Could not load feedback',
  'error.generic':        'Could not save feedback',
} satisfies Record<string, string>

/** The namespace key union. */
export type MessageFeedbackKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'action.like':          'Buena respuesta',
  'action.likeActive':    'Quitar valoración',
  'action.dislike':       'Mala respuesta',
  'action.dislikeActive': 'Quitar valoración',
  'note.open':            'Agregar una nota',
  'note.placeholder':     '¿Qué estuvo bien o qué falló? (opcional)',
  'note.save':            'Guardar',
  'note.cancel':          'Cancelar',
  'note.aria':            'Nota de feedback',
  'error.conflict':       'Este feedback cambió en otro lado; se muestra el estado más reciente',
  'error.load':           'No se pudo cargar el feedback',
  'error.generic':        'No se pudo guardar el feedback',
} satisfies Record<MessageFeedbackKey, string>
