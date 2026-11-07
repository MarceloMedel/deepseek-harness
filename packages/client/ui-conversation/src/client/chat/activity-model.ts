/**
 * Pure derivation for the collapsed activity row: which Chat Nodes belong to
 * one run of work, the call titles that run executed, its thinking time, and
 * the failure line it must never hide.
 *
 * Call titles come from the host's own presentation (`ToolCallView.title`), so
 * no Tool-owned wording is duplicated here; the expanded rows are still the
 * Tool renderers' own.
 */

import type {
  ChatConversationViewNode, ConversationTimelineSnapshot, ToolCallBlock, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { isRunningTool, type AssistantChatData, type ToolChatData } from '../contract/chat-nodes.ts'

/** Chat Node kinds that one activity run may contain. */
const ACTIVITY_KINDS: ReadonlySet<string> = new Set(['tool-call', 'assistant-step'])

/**
 * Test whether a node kind can join an activity run. Content decides later —
 * a run is cut only where a node renders prose of its own.
 * @param kind - Chat Node kind.
 * @returns whether the kind belongs to a run.
 */
export function isActivityKind(kind: string): boolean {
  return ACTIVITY_KINDS.has(kind)
}

/**
 * Read the turn a Chat Node belongs to.
 * @param node - Chat Node.
 * @returns its turn number, or undefined for a node outside any turn.
 */
export function turnOf(node: ChatConversationViewNode | undefined): number | undefined {
  if (node === undefined) return undefined
  const location = node.location
  return location.kind === 'turn' || location.kind === 'step' ? location.turn.turn : undefined
}

/**
 * Test whether a node paints prose (or an image, or an unknown block) of its
 * own. Such a node is the run's boundary: folding it would hide the answer.
 * @param node - Chat Node.
 * @returns whether the node must render outside any collapsed row.
 */
export function hasVisibleProse(node: ChatConversationViewNode): boolean {
  if (node.kind !== 'assistant-step') return false
  return (node.data as AssistantChatData).blocks.some((block) => {
    switch (block.kind) {
      case 'text': return block.text.trim() !== ''
      case 'reasoning':
      case 'tool-call': return false
      default: return true
    }
  })
}

/**
 * One call title with the number of calls that share it.
 */
export interface ActivityCall {
  /** Host-provided display title for the call's own card header. */
  readonly title: string
  /** Calls sharing this title. */
  readonly count: number
}

/** One render unit produced by the run splitter. */
type Segment =
  | { readonly kind: 'seat'; readonly node: ChatConversationViewNode }
  | { readonly kind: 'fold'; readonly nodes: readonly ChatConversationViewNode[] }

/**
 * Split a run at every member that paints prose of its own.
 * @param nodes - the run's nodes, in render order, with any vanished member absent.
 * @returns foldable segments (two or more members) and single seats, in order.
 */
export function segmentRun(nodes: readonly (ChatConversationViewNode | undefined)[]): Segment[] {
  const segments: Segment[] = []
  let run: ChatConversationViewNode[] = []
  const flush = (): void => {
    if (run.length === 1) segments.push({ kind: 'seat', node: run[0] as ChatConversationViewNode })
    else if (run.length > 1) segments.push({ kind: 'fold', nodes: run })
    run = []
  }
  for (const node of nodes) {
    if (node === undefined) continue
    // A seat outside the activity vocabulary is a boundary in its own right:
    // messages, errors, and tails never join a run.
    if (!isActivityKind(node.kind) || hasVisibleProse(node)) {
      flush()
      segments.push({ kind: 'seat', node })
      continue
    }
    run.push(node)
  }
  flush()
  return segments
}

/** Collapsed-row content for one activity run. */
export interface ActivitySummary {
  /** Distinct call titles in first-seen order, each with its repeat count. */
  readonly calls: readonly ActivityCall[]
  /** Calls in the run, including repeats. */
  readonly callCount: number
  /** Reasoning blocks carrying text. */
  readonly thoughtCount: number
  /** Last non-empty line of the run's final reasoning block; null when it held none. */
  readonly lastThought: string | null
  /** Wall time from the run's first to its last record; null while it still runs. */
  readonly durationMs: number | null
  /** Whether any record is still in flight. */
  readonly running: boolean
  /** First line of the run's first failed call; null when nothing failed. */
  readonly errorLine: string | null
}

/**
 * Display title for one call: the host's own presentation, else the wire name.
 * @param root - running or settled call block.
 * @returns the title a UI shows for this call.
 */
export function callDisplayTitle(root: ToolCallBlock): string {
  const view = root.callView
  if (view !== null) return view.title
  return 'kind' in root ? root.call?.name ?? root.callId : root.name
}

/** First line of a failed call's result text, falling back to its error identity. */
function failureLine(root: ToolResultNode): string | null {
  if (!root.isError) return null
  const text = root.content.find(block => block.type === 'text')
  const line = text === undefined ? '' : text.text.split('\n')[0]?.trim() ?? ''
  if (line !== '') return line
  return root.error === undefined ? null : `${root.error.name}: ${root.error.code}`
}

/** Last non-empty line of a reasoning text. */
function lastLine(text: string): string {
  const lines = text.trimEnd().split('\n')
  return lines.at(-1)?.trim() ?? ''
}

/**
 * Fold one activity run into the summary its collapsed row shows.
 * @param nodes - the run's Chat Nodes, in render order.
 * @returns call titles, counts, thinking time, duration, and failure line.
 */
export function summarizeActivity(nodes: readonly ChatConversationViewNode[]): ActivitySummary {
  const counts = new Map<string, number>()
  let callCount = 0
  let thoughtCount = 0
  let lastThought: string | null = null
  let errorLine: string | null = null
  let running = false
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  for (const node of nodes) {
    if (node.kind === 'tool-call') {
      const root = (node.data as ToolChatData).root
      const title = callDisplayTitle(root)
      callCount += 1
      counts.set(title, (counts.get(title) ?? 0) + 1)
      first = Math.min(first, root.time)
      last = Math.max(last, root.time)
      if (isRunningTool(root)) {
        running = true
        continue
      }
      const failure = failureLine(root)
      if (failure !== null && errorLine === null) errorLine = failure
      continue
    }
    if (node.kind !== 'assistant-step') continue
    const data = node.data as AssistantChatData
    first = Math.min(first, data.time)
    last = Math.max(last, data.time)
    if (data.status === 'running') running = true
    for (const block of data.blocks) {
      if (block.kind !== 'reasoning') continue
      const text = block.text.trim()
      if (text === '') continue
      thoughtCount += 1
      lastThought = lastLine(text)
    }
  }
  const calls: ActivityCall[] = []
  for (const [title, count] of counts) calls.push({ title, count })
  return {
    calls,
    callCount,
    thoughtCount,
    lastThought,
    durationMs: running || last < first ? null : last - first,
    running,
    errorLine,
  }
}

/**
 * Turn-start time of the session's running turn.
 * @param timeline - the Chat target's turn timeline.
 * @returns the latest open turn's start, or null when that boundary is outside the window.
 */
export function runningTurnStart(timeline: ConversationTimelineSnapshot): number | null {
  let latest: number | null = null
  for (const turn of timeline.turns.values()) {
    if (turn.status === 'open' && turn.start !== undefined) latest = turn.start.time
  }
  return latest
}
