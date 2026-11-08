/** `workflowRun` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workflowRun'

/** English dictionary (the key-set source of truth). */
export const en = {
  'run.title':               '{name}',
  'run.members.one':         '{count} member',
  'run.members.other':       '{count} members',
  'run.empty':               'No members started',
  'phase.unassigned':        'Unphased',
  'phase.empty':             'Empty phase name',
  'statusCount.running':     'Running {count}',
  'statusCount.completed':   'Completed {count}',
  'statusCount.failed':      'Failed {count}',
  'statusCount.cancelled':   'Cancelled {count}',
  'statusCount.interrupted': 'Interrupted {count}',
  'member.empty':            'Empty member name',
  'member.open':             'Open {name}',
  'status.running':          'Running',
  'status.completed':        'Completed',
  'status.failed':           'Failed',
  'status.cancelled':        'Cancelled',
  'status.interrupted':      'Interrupted',
} satisfies Record<string, string>

/** The namespace key union. */
export type WorkflowRunKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'run.title':               '{name}',
  'run.members.one':         '{count} integrante',
  'run.members.other':       '{count} integrantes',
  'run.empty':               'No se inició ningún integrante',
  'phase.unassigned':        'Sin fase',
  'phase.empty':             'Nombre de fase vacío',
  'statusCount.running':     'En ejecución {count}',
  'statusCount.completed':   'Completadas {count}',
  'statusCount.failed':      'Fallidas {count}',
  'statusCount.cancelled':   'Canceladas {count}',
  'statusCount.interrupted': 'Interrumpidas {count}',
  'member.empty':            'Nombre de integrante vacío',
  'member.open':             'Abrir {name}',
  'status.running':          'En ejecución',
  'status.completed':        'Completada',
  'status.failed':           'Fallida',
  'status.cancelled':        'Cancelada',
  'status.interrupted':      'Interrumpida',
} satisfies Record<WorkflowRunKey, string>
