/** `deliverables` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deliverables'

/** English dictionary (the key-set source of truth). */
export const en = {
  'produced.label':        'Produced',
  'produced.moreOne':      '+ 1 file',
  'produced.more':         '+ {count} files',
  'produced.open':         'Open {name}',
  'produced.showInFolder': 'Show in folder',
} satisfies Record<string, string>

/** The namespace key union. */
export type DeliverablesKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'produced.label':        'Producido',
  'produced.moreOne':      '+ 1 archivo',
  'produced.more':         '+ {count} archivos',
  'produced.open':         'Abrir {name}',
  'produced.showInFolder': 'Mostrar en la carpeta',
} satisfies Record<DeliverablesKey, string>
