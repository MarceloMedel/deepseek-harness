/** `plan` namespace dictionaries (the composer plan chip's copy). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'chip.on.aria':   'Plan mode on, press to turn off',
  'chip.on.title':  'Plan mode on — click to turn off (/plan off)',
  'chip.off.aria':  'Plan mode off, press to turn on',
  'chip.off.title': 'Plan mode off — click to turn on (/plan)',
} satisfies Record<string, string>

/** The namespace key union. */
export type PlanKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'chip.on.aria':   'Modo plan activado, pulsá para desactivar',
  'chip.on.title':  'Modo plan activado — clic para desactivar (/plan off)',
  'chip.off.aria':  'Modo plan desactivado, pulsá para activar',
  'chip.off.title': 'Modo plan desactivado — clic para activar (/plan)',
} satisfies Record<PlanKey, string>
