// LiveActivity: the one place that answers "what is it doing now?" — a single
// line docked above the composer, outside the scrolling transcript, so it
// cannot pass the reader by. While a tool runs it names that call with the
// host's own presentation title; between calls it reports that the agent is
// working; the turn's clock rides the same line.
//
// It replaces the in-flow "Deep diving..." status: one home per fact, and the
// flow keeps only what already happened.

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { callDisplayTitle, runningTurnStart } from './activity-model.ts'
import { formatRunDuration } from './message-chrome.ts'
import css from './LiveActivity.module.css'

/** Full props of the live line: the session standard kit plus the locale seat. */
export type LiveActivityProps =
  Pick<PropsRuntime<'conversation.input.dock'>, 'useSession'>
  & PropsLocale<'conversation'>

/**
 * Render the live activity line, or nothing when no turn is running.
 * @param props - session reads and the conversation locale seat.
 * @returns the docked status line.
 */
export function LiveActivity({ useSession, t }: LiveActivityProps) {
  const running = useSession(snapshot => snapshot.running)
  const currentCall = useSession((snapshot) => {
    const call = snapshot.runningCalls.at(-1)
    return call === undefined ? null : callDisplayTitle(call)
  })
  const startTime = useSession(snapshot => runningTurnStart(snapshot.chat.timeline))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(id) }
  }, [running])
  if (!running) return null
  return (
    <div className={css.root} role="status" aria-live="polite" data-live-activity="">
      <StateDot state="ongoing" size={10} />
      <span className={css.label}>{currentCall ?? t('live.working')}</span>
      {startTime !== null && (
        <span className={css.clock}>{formatRunDuration(Math.max(0, now - startTime), t)}</span>
      )}
    </div>
  )
}
