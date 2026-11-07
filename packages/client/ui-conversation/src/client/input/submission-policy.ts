/**
 * Composer submission policy. It owns the live busy-Enter
 * preference and resolves keyboard gestures into queue/steer delivery modes;
 * Host and Agent keep the actual delivery-window authority.
 */
import type {
  SettingsScope, SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  BusyEnterBehavior, ComposerSubmitGesture, InputSubmitMode,
} from '../contract/composer-submission.ts'
import { BUSY_ENTER_FIELD, DEFAULT_BUSY_ENTER_BEHAVIOR } from '../../conversation-settings.ts'
import type { ConversationSettings } from '../../conversation-settings.ts'
import { bindPreference, type DurablePreference } from '../preferences.ts'

export { DEFAULT_BUSY_ENTER_BEHAVIOR } from '../../conversation-settings.ts'

/**
 * Busy-Enter policy used by both the composer inject face and its Settings row.
 * Direct `steer` is intentionally best-effort: AgentLoop turns a closed-window
 * submission into the next waking Queue item.
 */
export class ComposerSubmissionPolicy {
  /** Reactive preference source for the Settings row. */
  readonly busyEnter: SnapshotStore<BusyEnterBehavior>
  private readonly preference: DurablePreference<BusyEnterBehavior>

  /**
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions stay process-local.
   */
  constructor(host?: SettingsScope<ConversationSettings>) {
    this.preference = bindPreference(
      host, BUSY_ENTER_FIELD, DEFAULT_BUSY_ENTER_BEHAVIOR, settings => settings.busyEnter,
    )
    this.busyEnter = this.preference.value
  }

  /**
   * Resolve one keyboard gesture without changing state.
   * @param running - whether the addressed agent currently reports busy.
   * @param gesture - plain Enter or the Cmd/Ctrl-accelerated chord.
   * @param steeringAvailable - whether this session transport supports steering.
   * @returns Queue outside steer-capable busy state; otherwise the preferred mode or its opposite.
   */
  resolve(
    running: boolean,
    gesture: ComposerSubmitGesture,
    steeringAvailable: boolean,
  ): InputSubmitMode {
    if (!running || !steeringAvailable) return 'queue'
    const preferred = this.busyEnter.getSnapshot()
    if (gesture === 'enter') return preferred
    return preferred === 'queue' ? 'steer' : 'queue'
  }

  /**
   * Change the plain-Enter behavior used during busy state; the live value
   * publishes before the durable write starts.
   * @param behavior - Queue or Steer.
   */
  setBusyEnter(behavior: BusyEnterBehavior): void {
    this.preference.set(behavior)
  }
}
