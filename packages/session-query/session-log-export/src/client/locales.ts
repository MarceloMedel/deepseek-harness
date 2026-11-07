/** Locale namespace owned by Session export browser feedback. */
export const NS = 'session-log-download'

/** English dictionary (the key-set source of truth). */
export const en = {
  'dialog.preparingTitle':       'Exporting Session',
  'dialog.preparingDescription': 'Preparing a ZIP containing this Session, its sub-Sessions, and attachments.',
  'dialog.successTitle':         'Session download started',
  'dialog.successDescription':   'The browser is downloading the Session ZIP.',
  'dialog.errorTitle':           'Session export failed',
  'dialog.close':                'Close',
  'dialog.commandFailed':        'Could not start the Session export.',
} satisfies Record<string, string>

/** The namespace key union. */
export type SessionLogDownloadKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'dialog.preparingTitle':       'Exportando la sesión',
  'dialog.preparingDescription': 'Preparando un ZIP con esta sesión, sus subsesiones y los adjuntos.',
  'dialog.successTitle':         'Comenzó la descarga de la sesión',
  'dialog.successDescription':   'El navegador está descargando el ZIP de la sesión.',
  'dialog.errorTitle':           'Falló la exportación de la sesión',
  'dialog.close':                'Cerrar',
  'dialog.commandFailed':        'No se pudo iniciar la exportación de la sesión.',
} satisfies Record<SessionLogDownloadKey, string>
