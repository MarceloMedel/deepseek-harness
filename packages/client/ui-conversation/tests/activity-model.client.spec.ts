// @vitest-environment jsdom
// Activity model: run splitting, the collapsed summary, and the live line's
// reads — pure functions over Chat Nodes, no render machinery.

import { describe, expect, it } from 'vitest'
import type {
  AssistantBlock, ChatConversationViewNode, RunningToolCall, ToolResultNode, TurnLocation,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { AssistantChatData, ToolChatData } from '../src/client/contract/chat-nodes.ts'
import {
  callDisplayTitle, hasVisibleProse, isActivityKind, runningTurnStart, segmentRun, summarizeActivity, turnOf,
} from '../src/client/chat/activity-model.ts'

const TURN: TurnLocation = {
  turn: 1,
  start: undefined,
  end: undefined,
  status: 'open',
  steps: [],
  data: { get: () => undefined },
} as unknown as TurnLocation

function assistantNode(
  key: string,
  blocks: readonly AssistantBlock[],
  time: number,
  options: { readonly status?: AssistantChatData['status']; readonly turn?: number } = {},
): ChatConversationViewNode {
  const data: AssistantChatData = {
    status: options.status ?? 'settled',
    turn: options.turn ?? 1,
    step: 1,
    blocks,
    time,
  }
  return {
    key,
    kind: 'assistant-step',
    id: key,
    target: 'chat',
    anchorSeq: time,
    location: { kind: 'turn', turn: TURN },
    visibility: 'visible',
    data,
  }
}

function toolNode(key: string, root: RunningToolCall | ToolResultNode, turn = 1): ChatConversationViewNode {
  return {
    key,
    kind: 'tool-call',
    id: key,
    target: 'chat',
    anchorSeq: 0,
    location: { kind: 'turn', turn: { ...TURN, turn } },
    visibility: 'visible',
    data: { root } satisfies ToolChatData,
  }
}

function runningCall(over: Partial<RunningToolCall> = {}): RunningToolCall {
  return {
    callId: 'call-1', name: 'bash', argsRaw: '{"command":"pnpm lint"}', turn: 1, step: 1,
    time: 1_000, callView: { card: 'terminal', title: 'pnpm lint' }, subCalls: [],
    ...over,
  }
}

function settledCall(over: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result', seq: 3, time: 2_000, callId: 'call-1',
    call: { name: 'read', argsRaw: '{"file_path":"a.ts"}' },
    callTime: 1_500, content: [], isError: false,
    callView: { card: 'generic', title: 'Read a.ts' },
    resultView: null, subCalls: [],
    ...over,
  }
}

describe('run classification', () => {
  it('admits tool calls and Assistant steps, and nothing else, into a run', () => {
    expect(isActivityKind('tool-call')).toBe(true)
    expect(isActivityKind('assistant-step')).toBe(true)
    expect(isActivityKind('user')).toBe(false)
    expect(isActivityKind('turn-tail')).toBe(false)
  })

  it('reads a node turn and returns nothing for a node outside a turn', () => {
    expect(turnOf(toolNode('t1', settledCall()))).toBe(1)
    expect(turnOf(undefined)).toBeUndefined()
    expect(turnOf({
      ...toolNode('t1', settledCall()),
      location: { kind: 'session' },
    })).toBeUndefined()
  })

  it('treats only prose, images, and unknown blocks as prose of their own', () => {
    expect(hasVisibleProse(assistantNode('a', [{ kind: 'text', text: 'done' }], 1))).toBe(true)
    expect(hasVisibleProse(assistantNode('a', [{ kind: 'text', text: '   \n' }], 1))).toBe(false)
    expect(hasVisibleProse(assistantNode('a', [{ kind: 'reasoning', text: 'thinking' }], 1))).toBe(false)
    expect(hasVisibleProse(assistantNode('a', [{ kind: 'tool-call', callId: 'c', name: 'bash', argsRaw: '{}' }], 1))).toBe(false)
    expect(hasVisibleProse(assistantNode('a', [{ kind: 'image', attachment: {} as never }], 1))).toBe(true)
    expect(hasVisibleProse(assistantNode('a', [{ kind: 'other', block: {} }], 1))).toBe(true)
    expect(hasVisibleProse(toolNode('t', runningCall()))).toBe(false)
  })
})

describe('segmentRun', () => {
  it('folds a run of two or more activity nodes', () => {
    const segments = segmentRun([toolNode('t1', settledCall()), toolNode('t2', settledCall())])
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ kind: 'fold' })
  })

  it('leaves a lone activity node as its own seat', () => {
    const single = toolNode('t1', settledCall())
    expect(segmentRun([single])).toEqual([{ kind: 'seat', node: single }])
  })

  it('cuts the run at prose and keeps the prose node seated', () => {
    const prose = assistantNode('a1', [{ kind: 'text', text: 'Answer' }], 1)
    const segments = segmentRun([
      toolNode('t1', settledCall()),
      toolNode('t2', settledCall()),
      prose,
      toolNode('t3', settledCall()),
    ])
    expect(segments.map((segment: { readonly kind: string }) => segment.kind)).toEqual(['fold', 'seat', 'seat'])
    expect(segments[1]).toEqual({ kind: 'seat', node: prose })
  })

  it('drops vanished members and empty input', () => {
    expect(segmentRun([])).toEqual([])
    expect(segmentRun([undefined])).toEqual([])
    const [only] = segmentRun([undefined, toolNode('t1', settledCall()), undefined])
    expect(only?.kind).toBe('seat')
    expect(only?.kind === 'seat' ? only.node.key : null).toBe('t1')
  })
})

describe('summarizeActivity', () => {
  it('names distinct calls with their repeat count and spans the run in time', () => {
    const summary = summarizeActivity([
      toolNode('t1', settledCall({ time: 2_000, callView: { card: 'generic', title: 'Read a.ts' } })),
      toolNode('t2', settledCall({ time: 9_000, callView: { card: 'generic', title: 'Read a.ts' } })),
      toolNode('t3', settledCall({ time: 12_000, callView: { card: 'terminal', title: 'pnpm lint' } })),
    ])
    expect(summary.calls).toEqual([
      { title: 'Read a.ts', count: 2 },
      { title: 'pnpm lint', count: 1 },
    ])
    expect(summary.callCount).toBe(3)
    expect(summary.durationMs).toBe(10_000)
    expect(summary.running).toBe(false)
    expect(summary.errorLine).toBeNull()
  })

  it('counts thinking blocks and previews the last line of the last one', () => {
    const summary = summarizeActivity([
      assistantNode('a1', [{ kind: 'reasoning', text: 'first thought\nsecond line' }], 1_000),
      toolNode('t1', settledCall({ time: 2_000 })),
      assistantNode('a2', [
        { kind: 'reasoning', text: '   ' },
        { kind: 'reasoning', text: 'look at the test\nand the mock' },
      ], 3_000),
    ])
    expect(summary.thoughtCount).toBe(2)
    expect(summary.lastThought).toBe('and the mock')
  })

  it('reports a run still in flight without inventing a duration', () => {
    const summary = summarizeActivity([
      assistantNode('a1', [{ kind: 'reasoning', text: 'digging' }], 1_000, { status: 'running' }),
      toolNode('t1', runningCall({ time: 2_000 })),
    ])
    expect(summary.running).toBe(true)
    expect(summary.durationMs).toBeNull()
  })

  it('falls back to the wire name, then the call id, when no presentation exists', () => {
    expect(callDisplayTitle(runningCall({ callView: null, name: 'grep' }))).toBe('grep')
    expect(callDisplayTitle(settledCall({ callView: null }))).toBe('read')
    expect(callDisplayTitle(settledCall({ callView: null, call: null }))).toBe('call-1')
  })

  it('surfaces the first failure line and falls back to the error identity', () => {
    const text = summarizeActivity([toolNode('t1', settledCall({
      isError: true,
      content: [{ type: 'text', text: 'exit 1\nsecond line' }] as never,
    }))])
    expect(text.errorLine).toBe('exit 1')
    const identity = summarizeActivity([toolNode('t1', settledCall({
      isError: true,
      content: [],
      error: { name: 'ShellError', code: 'EPIPE' },
    }))])
    expect(identity.errorLine).toBe('ShellError: EPIPE')
    const silent = summarizeActivity([toolNode('t1', settledCall({ isError: true, content: [] }))])
    expect(silent.errorLine).toBeNull()
  })

  it('keeps the first failure of a run and ignores non-activity nodes', () => {
    const summary = summarizeActivity([
      toolNode('t1', settledCall({ isError: true, content: [{ type: 'text', text: 'one' }] as never })),
      toolNode('t2', settledCall({ isError: true, content: [{ type: 'text', text: 'two' }] as never })),
      toolNode('t3', settledCall()),
      { ...toolNode('t4', settledCall()), kind: 'user' },
    ])
    expect(summary.errorLine).toBe('one')
    expect(summary.callCount).toBe(3)
  })

  it('ignores non-activity nodes when spanning the run', () => {
    const summary = summarizeActivity([
      { ...toolNode('t0', settledCall({ time: 500 })), kind: 'context' },
      toolNode('t1', settledCall({ time: 5_000 })),
    ])
    expect(summary.durationMs).toBe(0)
  })

  it('reports an empty run without a label source', () => {
    expect(summarizeActivity([])).toEqual({
      calls: [],
      callCount: 0,
      thoughtCount: 0,
      lastThought: null,
      durationMs: null,
      running: false,
      errorLine: null,
    })
  })
})

describe('runningTurnStart', () => {
  it('reads the latest open turn and ignores closed ones', () => {
    const timeline = {
      turnOrder: [1, 2],
      turns: new Map([
        [1, { turn: 1, status: 'open', start: { time: 100 }, steps: [], data: { get: () => undefined } }],
        [2, { turn: 2, status: 'open', start: { time: 900 }, steps: [], data: { get: () => undefined } }],
      ]),
    } as unknown as Parameters<typeof runningTurnStart>[0]
    expect(runningTurnStart(timeline)).toBe(900)
  })

  it('returns null when no open turn carries a start boundary', () => {
    const timeline = {
      turnOrder: [],
      turns: new Map([[1, { turn: 1, status: 'closed', steps: [], data: { get: () => undefined } }]]),
    } as unknown as Parameters<typeof runningTurnStart>[0]
    expect(runningTurnStart(timeline)).toBeNull()
  })
})
