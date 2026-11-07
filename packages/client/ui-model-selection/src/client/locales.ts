/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` reads identically to `trigger.fallback` today and is
 * still a separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** English dictionary (the key-set source of truth). */
export const en = {
  'command.description':    'Select the model for this conversation',
  'option.loadError':       'Catalog failed to load: {message}',
  'trigger.fallback':       'Select model',
  'trigger.selectAria':     'Select model',
  'trigger.aria':           'Select model, current {model}',
  'trigger.ariaEffort':     'Select model, current {model}, reasoning effort {effort}',
  'menu.aria':              'Model and reasoning effort',
  'menu.model':             'Model',
  'menu.effort':            'Effort',
  'effort.providerDefault': 'Default',
  'status.loading':         'Refreshing model list…',
  'error.action':           'Model operation failed: {message}',
  'action.reload':          'Reload',
  'warning.groupLoad':      '{name} failed to load: {message}',
  'empty.models':           'No models available.',
  'blocked.composer':       'This model is unavailable — select one to continue',
  'empty.efforts':          'This model provides no reasoning effort levels.',
} satisfies Record<string, string>

/** The namespace key union. */
export type ModelKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'command.description':    'Elegí el modelo para esta conversación',
  'option.loadError':       'No se pudo cargar el catálogo: {message}',
  'trigger.fallback':       'Elegir modelo',
  'trigger.selectAria':     'Elegir modelo',
  'trigger.aria':           'Elegir modelo, actual {model}',
  'trigger.ariaEffort':     'Elegir modelo, actual {model}, esfuerzo de razonamiento {effort}',
  'menu.aria':              'Modelo y esfuerzo de razonamiento',
  'menu.model':             'Modelo',
  'menu.effort':            'Esfuerzo',
  'effort.providerDefault': 'Predeterminado',
  'status.loading':         'Actualizando la lista de modelos…',
  'error.action':           'Falló la operación sobre el modelo: {message}',
  'action.reload':          'Recargar',
  'warning.groupLoad':      'No se pudo cargar {name}: {message}',
  'empty.models':           'No hay modelos disponibles.',
  'blocked.composer':       'Este modelo no está disponible — elegí uno para continuar',
  'empty.efforts':          'Este modelo no ofrece niveles de esfuerzo de razonamiento.',
} satisfies Record<ModelKey, string>
