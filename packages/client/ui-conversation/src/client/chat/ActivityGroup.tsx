// ActivityGroup: one run of work inside a turn — consecutive Assistant steps
// that carry no prose of their own plus the Tool calls they dispatched —
// rendered as one collapsed row and expanded into exactly the rows the Tool
// and Assistant renderers already produce.
//
// The run is only folded where nothing is hidden by folding: a member that
// paints prose (or an image, or an unknown block) renders as its own seat and
// cuts the run in two. A failure never hides: the collapsed row carries the
// failure's first line and the error state.
//
// Membership arrives from ChatView keyed by node identity; each member is read
// through the same per-key selector the plain seat uses, so a delta updates
// the collapsed summary without touching sibling rows.

import { memo, useMemo, useState } from 'react'
import {
  DisclosureRow, IconSparkle16, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../contract/slots.ts'
import type { ToolChatData } from '../contract/chat-nodes.ts'
import { formatRunDuration } from './message-chrome.ts'
import { segmentRun, summarizeActivity, type ActivitySummary } from './activity-model.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import a11yCss from './accessibility.module.css'
import css from './ActivityGroup.module.css'

/** Reference equality over the member list: a node object changes only when that node moved. */
function sameNodes(
  left: readonly (ChatConversationViewNode | undefined)[],
  right: readonly (ChatConversationViewNode | undefined)[],
): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index])
}

/** Collapsed title: what ran, how much it thought, how long it took. */
function foldTitle(summary: ActivitySummary, t: ChatViewSlotProps['t']): string {
  const parts: string[] = []
  if (summary.callCount === 1) parts.push(t('activity.tool'))
  else if (summary.callCount > 1) parts.push(t('activity.tools', { count: summary.callCount }))
  if (summary.thoughtCount === 1) parts.push(t('activity.thought'))
  else if (summary.thoughtCount > 1) parts.push(t('activity.thoughts', { count: summary.thoughtCount }))
  // A run of instant calls has no duration worth reporting; the clock would read `0s`.
  if (summary.durationMs !== null && summary.durationMs > 0) {
    parts.push(formatRunDuration(summary.durationMs, t))
  }
  return parts.length === 0 ? t('activity.label') : parts.join(' · ')
}

/** Collapsed summary line: the calls themselves, or the failure that outranks them. */
function foldSummary(summary: ActivitySummary): string {
  return summary.calls
    .map(call => call.count > 1 ? `${call.title} ×${call.count}` : call.title)
    .join(' · ')
}

interface ActivityProps extends ChatNodeOwnerProps {
  readonly useSession: ChatViewSlotProps['useSession']
  readonly renderSlot: ChatViewSlotProps['renderSlot']
  readonly t: ChatViewSlotProps['t']
}

/** One collapsed activity row over seats that keep their own expand state. */
const ActivityFold = memo(function ActivityFold({
  nodes, density, selectedCallId, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions,
  useSession, renderSlot, t,
}: ActivityProps & { readonly nodes: readonly ChatConversationViewNode[] }) {
  const summary = useMemo(() => summarizeActivity(nodes), [nodes])
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  // Inspecting a call from the details panel must reveal it: an outside
  // selection opens the fold, a reader gesture then owns the state.
  const selectedWithin = useMemo(
    () => selectedCallId !== undefined && nodes.some(node => node.kind === 'tool-call'
      && (node.data as ToolChatData).root.callId === selectedCallId),
    [nodes, selectedCallId],
  )
  const open = userOpen ?? selectedWithin
  const failure = summary.errorLine
  const thought = open ? null : failure === null ? summary.lastThought : null
  const anchorKey = `activity:${nodes[0]?.key ?? ''}`
  return (
    <div
      className={css.root}
      data-activity=""
      data-state={summary.running ? 'running' : 'ok'}
      data-chat-anchor-key={anchorKey}
      data-chat-flow-kind="activity"
    >
      {summary.running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={failure === null ? <IconSparkle16 size={14} /> : <StateDot state="error" />}
        title={foldTitle(summary, t)}
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => { setUserOpen(!open) }}
        collapsedContent={(
          <>
            <span className={css.sep} aria-hidden />
            <span className={css.summary} data-error={failure !== null || undefined}>
              {failure ?? foldSummary(summary)}
            </span>
          </>
        )}
      >
        <div className={css.body}>
          {nodes.map(node => (
            <ChatNodeSeat
              key={node.key}
              nodeKey={node.key}
              density={density}
              selectedCallId={selectedCallId}
              cwd={cwd}
              openFile={openFile}
              inspectCall={inspectCall}
              forkAt={forkAt}
              loadImage={loadImage}
              fileMentions={fileMentions}
              useSession={useSession}
              renderSlot={renderSlot}
              t={t}
            />
          ))}
        </div>
      </DisclosureRow>
      {thought !== null && <div className={css.thought}>{thought}</div>}
    </div>
  )
})

/**
 * Render one activity run: folded where the run holds no prose, seat by seat
 * where it does.
 * @param props - owner data, the run's member keys, and the view's seat shares.
 * @returns the run's rows, in flow order.
 */
export const ActivityGroup = memo(function ActivityGroup({
  keys, density, selectedCallId, cwd, openFile, inspectCall, forkAt, loadImage, fileMentions,
  useSession, renderSlot, t,
}: ActivityProps & { readonly keys: readonly string[] }) {
  const nodes = useSession(session => keys.map(key => session.chat.nodes.get(key)), sameNodes)
  const segments = useMemo(() => segmentRun(nodes), [nodes])
  return (
    <>
      {segments.map(segment => segment.kind === 'fold'
        ? (
          <ActivityFold
            key={`activity:${segment.nodes[0]?.key ?? ''}`}
            nodes={segment.nodes}
            density={density}
            selectedCallId={selectedCallId}
            cwd={cwd}
            openFile={openFile}
            inspectCall={inspectCall}
            forkAt={forkAt}
            loadImage={loadImage}
            fileMentions={fileMentions}
            useSession={useSession}
            renderSlot={renderSlot}
            t={t}
          />
        )
        : (
          <ChatNodeSeat
            key={segment.node.key}
            nodeKey={segment.node.key}
            density={density}
            selectedCallId={selectedCallId}
            cwd={cwd}
            openFile={openFile}
            inspectCall={inspectCall}
            forkAt={forkAt}
            loadImage={loadImage}
            fileMentions={fileMentions}
            useSession={useSession}
            renderSlot={renderSlot}
            t={t}
          />
        ))}
    </>
  )
})
