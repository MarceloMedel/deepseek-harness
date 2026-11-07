/**
 * Chat density preference: the live value the Chat view renders by and the
 * Settings row writes. The Host user-settings document is the durable home, so
 * the choice follows the user home across ports and reloads.
 */

import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CHAT_DENSITY_FIELD, DEFAULT_CHAT_DENSITY, type ChatDensity, type ConversationSettings,
} from '../../conversation-settings.ts'
import { bindPreference, type DurablePreference } from '../preferences.ts'

/**
 * How much of a turn's intermediate work the Chat view renders by default:
 * `compact` folds each run of work into one row, `balanced` gives every step
 * its own row, and `detailed` also opens the reasoning that accompanies it.
 */
export class ChatDensityPreference {
  /** Reactive preference source for the Chat view and the Settings row. */
  readonly density: SnapshotStore<ChatDensity>
  private readonly preference: DurablePreference<ChatDensity>

  /**
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions stay process-local.
   */
  constructor(host?: SettingsScope<ConversationSettings>) {
    this.preference = bindPreference(host, CHAT_DENSITY_FIELD, DEFAULT_CHAT_DENSITY, settings => settings.chatDensity)
    this.density = this.preference.value
  }

  /**
   * Publish and persist one chosen density.
   * @param density - compact, balanced, or detailed.
   */
  setDensity(density: ChatDensity): void {
    this.preference.set(density)
  }
}
