/**
 * One durable scalar conversation preference: a live snapshot store projected
 * from the Host settings section, published locally before the write crosses
 * the wire. Both shipped preferences (busy Enter, chat density) read their
 * value and their field through this seam so neither restates the adoption,
 * deduplication, or no-write-back rules.
 */

import {
  createSnapshotStore, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSettings } from '../conversation-settings.ts'

/** Registration-side face of one durable scalar preference. */
export interface DurablePreference<T> {
  /** Live value; the Settings row and the consuming view both subscribe here. */
  readonly value: SnapshotStore<T>
  /** Publish a user choice immediately, then persist it. */
  set(next: T): void
}

/**
 * Bind one field of the conversation settings section to a live store.
 * @param host - durable scope owned by the providing plugin; absent compositions stay process-local.
 * @param field - settings field carrying this preference.
 * @param initial - value used until the Host section loads.
 * @param read - projects the typed value out of the section.
 * @returns the live preference.
 */
export function bindPreference<T>(
  host: SettingsScope<ConversationSettings> | undefined,
  field: string,
  initial: T,
  read: (settings: ConversationSettings) => T,
): DurablePreference<T> {
  const value = createSnapshotStore<T>(initial)
  // Adopt whatever the Host already holds, then every later publication. The
  // subscription shares the scope's plugin lifetime, so no release hook is
  // needed here.
  const adopt = (): void => {
    const section = host?.getSnapshot().value
    if (section === undefined) return
    const next = read(section)
    if (value.getSnapshot() === next) return
    value.set(next)
  }
  if (host !== undefined) {
    host.subscribe(adopt)
    adopt()
  }
  return {
    value,
    set: (next) => {
      if (value.getSnapshot() === next) return
      value.set(next)
      void host?.set(field, next)
    },
  }
}
