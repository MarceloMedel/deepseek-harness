/**
 * The trajectory view's tab, offered by the conversation itself.
 *
 * The trajectory package is a surface row: its bundle is not fetched until
 * something opens the surface, so its `conversation.view` entry does not exist
 * at boot. A ring that only lists registered entries would silently lose that
 * view until something else mounted it, so the conversation projects one
 * synthetic tab for it while the surface exists and no entry claims the id. The
 * synthetic tab carries the shared `common` label (the same key the trajectory
 * package reads), and selecting it renders {@link TrajectorySurfacePending},
 * which mounts the row; once the row registers, the ledger entry replaces the
 * synthetic tab and the real view renders.
 */
import { useEffect, useState } from 'react'
import css from './TrajectorySurface.module.css'

/** Surface the trajectory row declares (`dsh.client.surface`). */
export const TRAJECTORY_SURFACE = 'trajectory'

/** View id the trajectory package registers. */
export const TRAJECTORY_VIEW_ID = 'trajectory'

/** Props of the wait: the mount callback plus the shared-catalog translate. */
export interface TrajectorySurfacePendingProps {
  /**
   * Mount the trajectory surface's rows.
   * @returns resolves once they are active; rejects when their mount fails.
   */
  ensureView: () => Promise<void>
  /** Translate a key from the shared `common` catalog. */
  t: (key: 'loading' | 'load.failed') => string
}

/**
 * Render the wait before the trajectory row arrives.
 * @param props - the mount callback and the translate seat.
 * @returns a status row that switches to the failure copy when the mount fails.
 */
export function TrajectorySurfacePending({ ensureView, t }: TrajectorySurfacePendingProps) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    // A failed mount keeps the tab (retrying is switching away and back) and
    // says so, instead of painting an empty view forever.
    void ensureView().catch((error: unknown) => {
      console.error(error)
      setFailed(true)
    })
  }, [ensureView])
  return (
    <div className={css.pending} role="status">
      {failed ? t('load.failed') : t('loading')}
    </div>
  )
}
