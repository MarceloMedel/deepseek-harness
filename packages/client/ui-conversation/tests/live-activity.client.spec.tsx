// @vitest-environment jsdom
// Live activity line: the docked answer to "what is it doing now?" — the call
// in flight, the working label between calls, and the turn's clock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { ConversationSnapshot, RunningToolCall } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { LiveActivity } from '../src/client/chat/LiveActivity.tsx'
import { zh } from '../src/client/locales.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function runningCall(over: Partial<RunningToolCall> = {}): RunningToolCall {
  return {
    callId: 'call-1', name: 'bash', argsRaw: '{"command":"pnpm lint"}', turn: 1, step: 1,
    time: 1_000, callView: { card: 'terminal', title: 'pnpm lint' }, subCalls: [],
    ...over,
  }
}

function harness(init: {
  readonly running?: boolean
  readonly runningCalls?: readonly RunningToolCall[]
  readonly startTime?: number
} = {}) {
  const startTime = init.startTime ?? Date.now()
  const chat = chatSnapshotFixture({
    turnTimings: new Map([[1, { startTime }]]),
    runningCalls: init.runningCalls ?? [],
  })
  const snapshot: ConversationSnapshot = {
    sessionId: 's1' as never, views: { get: () => undefined } as never, chat, nodes: [],
    turnTimings: chat.legacy.turnTimings, turnEnds: new Map(),
    partial: null, runningCalls: init.runningCalls ?? [],
    pending: [], queue: [], running: init.running ?? false, composerPhase: 'active', removed: false,
    openState: 'open', openError: null, hasMore: false, loadingOlder: false,
    promptError: null, blank: false, subagent: null, lastAgentError: null,
  }
  const store = createSnapshotStore<ConversationSnapshot>(snapshot)
  return {
    props: { useSession: bindSnapshotSelector(store), t: makeTranslate(zh, commonZh) },
    store,
    startTime,
  }
}

describe('live activity line', () => {
  it('renders nothing unless a turn is running', () => {
    const h = harness({ running: false, runningCalls: [runningCall()] })
    const view = render(<LiveActivity {...h.props} />)
    expect(view.container.firstChild).toBeNull()
  })

  it('names the call in flight with the host title and the turn clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const h = harness({ running: true, runningCalls: [runningCall()], startTime: 91_000 })
    const view = render(<LiveActivity {...h.props} />)
    const status = view.getByRole('status')
    expect(status.textContent).toBe('pnpm lint9秒')
    expect(status.querySelector('[data-live-activity]')).toBeNull()
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(view.getByRole('status').textContent).toBe('pnpm lint11秒')
  })

  it('reports that the agent is working between calls', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const h = harness({ running: true, startTime: 99_000 })
    const view = render(<LiveActivity {...h.props} />)
    expect(view.getByRole('status').textContent).toBe('正在处理…1秒')
  })

  it('names the last call when several are in flight', () => {
    const h = harness({
      running: true,
      runningCalls: [
        runningCall({ callId: 'a', callView: { card: 'generic', title: 'Read a.ts' } }),
        runningCall({ callId: 'b', callView: { card: 'generic', title: 'grep tests' } }),
      ],
    })
    const view = render(<LiveActivity {...h.props} />)
    expect(view.getByRole('status').textContent).toContain('grep tests')
  })

  it('drops the clock when the turn start is outside the window', () => {
    const h = harness({ running: true, runningCalls: [runningCall()] })
    const withoutStart = chatSnapshotFixture({ runningCalls: [runningCall()] })
    h.store.set({ ...h.store.getSnapshot(), chat: withoutStart })
    const view = render(<LiveActivity {...h.props} />)
    expect(view.getByRole('status').textContent).toBe('pnpm lint')
  })
})
