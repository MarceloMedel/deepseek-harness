/** Durable conversation preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the conversation plugin. */
export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation'

/** Field carrying the delivery mode for plain Enter while an agent is busy. */
export const BUSY_ENTER_FIELD = 'busyEnter'

/** Busy-Enter behaviors accepted at settings and input boundaries. */
export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer'] as const

/** Configurable meaning of plain Enter while the addressed agent is busy. */
export type BusyEnterBehavior = typeof BUSY_ENTER_BEHAVIORS[number]

/** Default preserves Enter-as-Queue for running conversations. */
export const DEFAULT_BUSY_ENTER_BEHAVIOR: BusyEnterBehavior = 'queue'

/** Chat display density: how much of a turn's intermediate work renders by default. */
export const CHAT_DENSITIES = ['compact', 'balanced', 'detailed'] as const

/** One accepted chat density. */
export type ChatDensity = typeof CHAT_DENSITIES[number]

/** Field carrying the chat display density. */
export const CHAT_DENSITY_FIELD = 'chatDensity'

/** Default folds each run of work into one row. */
export const DEFAULT_CHAT_DENSITY: ChatDensity = 'compact'

/** Durable conversation section shared by the Host schema and the browser scope. */
export interface ConversationSettings {
  /** Delivery mode for plain Enter while the addressed agent is busy. */
  busyEnter: BusyEnterBehavior
  /** How much of a turn's intermediate work the chat view shows by default. */
  chatDensity: ChatDensity
}

/** Durable conversation schema; also the wire envelope the browser scope validates against. */
export const ConversationSettingsSchema: z<ConversationSettings> = z.object({
  [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR),
  [CHAT_DENSITY_FIELD]: z.union([...CHAT_DENSITIES]).default(DEFAULT_CHAT_DENSITY),
})
