/** General Settings row for how much intermediate work the Chat view shows. */
import { useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatDensity } from '../../conversation-settings.ts'
import type { ConversationKey } from '../locales.ts'
import css from './EnterBehaviorRow.module.css'

/** Registration-side density face. */
export interface DensityRowInjected {
  hooks: {
    /** Persisted chat density bound as useDensity. */
    density: SnapshotStore<ChatDensity>
  }
  /** Change the chat display density. */
  setDensity: (density: ChatDensity) => void
}

/** Full Settings-row props. */
export type DensityRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<DensityRowInjected>

const OPTIONS: readonly {
  id: ChatDensity
  label: ConversationKey
}[] = [
  { id: 'compact', label: 'settings.density.compact' },
  { id: 'balanced', label: 'settings.density.balanced' },
  { id: 'detailed', label: 'settings.density.detailed' },
]

/** Density ids to their row copy; the selector label follows the live value. */
const LABELS: Record<ChatDensity, ConversationKey> = {
  compact: 'settings.density.compact',
  balanced: 'settings.density.balanced',
  detailed: 'settings.density.detailed',
}

/**
 * Render the chat density selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function DensityRow({ useDensity, setDensity, t }: DensityRowProps) {
  const density = useDensity(value => value)
  const [open, setOpen] = useState(false)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.density.title')}</div>
        <div className={css.desc}>{t('settings.density.description')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={OPTIONS.map(option => ({ id: option.id, label: t(option.label) }))}
        selectedId={density}
        onSelect={(id) => {
          setOpen(false)
          setDensity(id as ChatDensity)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
          >
            {t(LABELS[density])}
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
