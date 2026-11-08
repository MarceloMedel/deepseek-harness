import type { CommonKey } from './en.ts'

/** Spanish base dictionary for the common namespace, checked complete against the English key set. */
export const es = {
  'ok': 'Aceptar',
  'cancel': 'Cancelar',
  'close': 'Cerrar',
  'copy': 'Copiar',
  'copied': 'Copiado',
  'retry': 'Reintentar',
  'loading': 'Cargando…',
  'load.failed': 'No se pudo cargar',
  'submit': 'Enviar',
  'submitting': 'Enviando…',
  'next': 'Siguiente',
  'previous': 'Anterior',
  'skip': 'Saltar',
  'delete': 'Eliminar',
  'edit': 'Editar',
  'save': 'Guardar',
  'search': 'Buscar',
  'more': 'Más',
  'collapse': 'Contraer',
  'expand': 'Expandir',
  'back': 'Atrás',
  'unknown': 'Desconocido',
  'none': 'Ninguno',
  'truncated': 'Truncado',
} satisfies Record<CommonKey, string>
