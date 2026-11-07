/** `job` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'job'

/** English dictionary (the key-set source of truth). */
export const en = {
  'count.live.one':      '{count} background job running',
  'count.live.other':    '{count} background jobs running',
  'count.idle.one':      '{count} background job',
  'count.idle.other':    '{count} background jobs',
  'list.aria':           'Background jobs',
  'status.running':      'running',
  'status.stopping':     'stopping',
  'status.completed':    'completed',
  'status.killed':       'cancelled',
  'status.failed':       'failed',
  'duration.seconds':    '{seconds}s',
  'duration.minutes':    '{minutes}m {seconds}s',
  'duration.hours':      '{hours}h {minutes}m',
  'duration.title.live': 'Running for {duration}',
  'duration.title.done': 'Took {duration}',
} satisfies Record<string, string>

/** The namespace key union. */
export type JobKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'count.live.one':      '{count} tarea en segundo plano en ejecución',
  'count.live.other':    '{count} tareas en segundo plano en ejecución',
  'count.idle.one':      '{count} tarea en segundo plano',
  'count.idle.other':    '{count} tareas en segundo plano',
  'list.aria':           'Tareas en segundo plano',
  'status.running':      'en ejecución',
  'status.stopping':     'deteniéndose',
  'status.completed':    'completada',
  'status.killed':       'cancelada',
  'status.failed':       'fallida',
  'duration.seconds':    '{seconds}s',
  'duration.minutes':    '{minutes}m {seconds}s',
  'duration.hours':      '{hours}h {minutes}m',
  'duration.title.live': 'En ejecución desde hace {duration}',
  'duration.title.done': 'Tomó {duration}',
} satisfies Record<JobKey, string>
