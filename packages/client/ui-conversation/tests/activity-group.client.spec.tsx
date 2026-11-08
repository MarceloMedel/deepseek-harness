// @vitest-environment jsdom
// Activity fold behavior: one collapsed row per run of work, named calls and a
// thought preview on the row, the Tool/Assistant seats behind the expand, and
// the guarantees that prose and failures never hide.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  AssistantMessageNode, ConversationSnapshot, ToolResultNode, UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode, ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { es as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/es.ts'
import { ActivityGroup } from '../src/client/chat/ActivityGroup.tsx'
import { es } from '../src/client/locales.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

const SID = 's1' as never

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

const user = (seq: number, text: string): UserMessageNode => ({
  kind: 'user', seq, time: seq * 1_000, content: [{ type: 'text', text }] as never, source: null,
})

const assistant = (seq: number, blocks: AssistantMessageNode['blocks']): AssistantMessageNode => ({
  kind: 'assistant', seq, time: seq * 1_000, turn: 1, step: 1, blocks,
})

const tool = (seq: number, callId: string, title: string, extra: Partial<ToolResultNode> = {}): ToolResultNode => ({
  kind: 'tool-result', seq, time: seq * 1_000, callId,
  call: { name: 'read', argsRaw: '{"file_path":"a.ts"}' },
  callTime: seq * 1_000 - 400,
  content: [],
  isError: false,
  callView: { card: 'generic', title },
  resultView: null,
  subCalls: [],
  ...extra,
})

function snapshot(chat: ConversationSnapshot['chat']): ConversationSnapshot {
  return {
    sessionId: SID, views: { get: () => undefined } as never, chat, nodes: [],
    turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue: [], running: false, composerPhase: 'active', removed: false,
    openState: 'open', openError: null, hasMore: false, loadingOlder: false,
    promptError: null, blank: false, subagent: null, lastAgentError: null,
  }
}

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

/** Render harness: real snapshot binding plus a seam-only node seat stub. */
function harness(nodes: Parameters<typeof chatSnapshotFixture>[0], selectedCallId?: string) {
  const chat = chatSnapshotFixture(nodes)
  const store = createSnapshotStore<ConversationSnapshot>(snapshot(chat))
  const seats = new Map<string, string>()
  const renderSlot = ((key: string, owner: object) => {
    if (key !== 'conversation.chat.node') return null
    const node = (owner as { node: ChatNode }).node
    const root = node.kind === 'tool-call' ? node.data.root : undefined
    if (root !== undefined && selectedCallId === root.callId) seats.set(root.callId, node.key)
    return <div data-testid={`seat-${node.key}`}>{node.kind}</div>
  }) as unknown as ChatViewSlotProps['renderSlot']
  const props = {
    keys: chat.order,
    density: 'compact' as const,
    selectedCallId,
    cwd: undefined,
    openFile: vi.fn(),
    inspectCall: vi.fn(),
    forkAt: vi.fn(),
    loadImage: vi.fn(() => Promise.reject(new Error('unused'))),
    fileMentions: () => undefined,
    useSession: bindSnapshotSelector(store),
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useProjection: () => undefined,
    useInput: () => { throw new Error('unused') },
    inputActions: {
      setDraft: () => {}, addImages: () => true, removeImage: () => {}, pruneImages: () => {}, submit: () => {},
    },
    useStore: bindSnapshotSelector(createSnapshotStore({ selection: null })),
    actions: {},
    renderSlot,
    SessionProvider: ({ children }: { children: (id: never) => ReactNode }) => <>{children(SID)}</>,
    t: makeTranslate(es, commonZh),
  }
  return { props: props as unknown as Parameters<typeof ActivityGroup>[0], store, chat, seats }
}

describe('activity fold', () => {
  it('collapses a run into one row that names its calls and previews its last thought', () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        assistant(2, [
          { kind: 'reasoning', text: 'first thought\nlook at the test mock' },
          { kind: 'tool-call', callId: 'c1', name: 'read', argsRaw: '{}' },
        ]),
        tool(3, 'c1', 'Read a.ts'),
        tool(4, 'c2', 'pnpm lint'),
        assistant(5, [{ kind: 'text', text: 'Fixed.' }]),
      ],
    })
    const view = render(<ActivityGroup {...h.props} />)
    const row = view.getByRole('button', { expanded: false })
    expect(row.textContent).toContain('2 llamadas a herramientas')
    expect(row.textContent).toContain('1 razonamiento')
    expect(row.textContent).toContain('Read a.ts')
    expect(row.textContent).toContain('pnpm lint')
    expect(view.getByText('look at the test mock')).toBeTruthy()
    // Collapsed: the Tool seats are not mounted at all.
    expect(view.queryByTestId('seat-fixture:tool:c1')).toBeNull()
    // The prose answer stays outside the fold.
    expect(view.getByTestId('seat-fixture:assistant:5')).toBeTruthy()
  })

  it('expands into the exact seats the run contains', () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        tool(2, 'c1', 'Read a.ts'),
        tool(3, 'c2', 'pnpm lint'),
      ],
    })
    const view = render(<ActivityGroup {...h.props} />)
    const row = view.getByRole('button', { expanded: false })
    fireEvent.click(row)
    expect(view.getByTestId('seat-fixture:tool:c1')).toBeTruthy()
    expect(view.getByTestId('seat-fixture:tool:c2')).toBeTruthy()
    expect(view.getByRole('button', { expanded: true })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { expanded: true }))
    expect(view.queryByTestId('seat-fixture:tool:c1')).toBeNull()
  })

  it('never folds a step that paints prose: the run splits around it', () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        tool(2, 'c1', 'Read a.ts'),
        tool(3, 'c2', 'pnpm lint'),
        assistant(4, [{ kind: 'text', text: 'Now editing.' }]),
        tool(5, 'c3', 'Edit a.ts'),
        tool(6, 'c4', 'Read b.ts'),
      ],
    })
    const view = render(<ActivityGroup {...h.props} />)
    // The prose step keeps its own seat, never inside a fold.
    expect(view.getByTestId('seat-fixture:assistant:4')).toBeTruthy()
    // A fold above the prose and another below it, never one over the prose.
    expect(view.getAllByRole('button', { expanded: false })).toHaveLength(2)
  })

  it('keeps a failure on the collapsed row instead of hiding it', () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        tool(2, 'c1', 'Read a.ts'),
        tool(3, 'c2', 'pnpm lint', {
          isError: true,
          content: [{ type: 'text', text: 'exit 1: two tests failed' }] as never,
        }),
      ],
    })
    const view = render(<ActivityGroup {...h.props} />)
    const row = view.getByRole('button', { expanded: false })
    expect(row.textContent).toContain('exit 1: two tests failed')
    expect(row.querySelector('[data-error]')).not.toBeNull()
    expect(row.querySelector('[data-state], [aria-label="error"]')).not.toBeNull()
  })

  it('opens the fold that holds a call selected from the details panel', () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        tool(2, 'c1', 'Read a.ts'),
        tool(3, 'c2', 'pnpm lint'),
      ],
    }, 'c2')
    const view = render(<ActivityGroup {...h.props} />)
    expect(view.getByTestId('seat-fixture:tool:c2')).toBeTruthy()
    expect(view.getByRole('button', { expanded: true })).toBeTruthy()
  })

  it('names a single call without a plural count', () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        assistant(2, []),
        tool(3, 'c1', 'Read a.ts'),
      ],
    })
    const view = render(<ActivityGroup {...h.props} />)
    const row = view.getByRole('button', { expanded: false })
    expect(row.textContent).toContain('1 llamada a herramienta')
    expect(row.textContent).not.toContain('个Herramientass')
    // A run whose records share one instant reports no duration at all.
    expect(row.textContent).not.toContain('0s')
  })

  it('leaves a lone activity node as its own seat', () => {
    const h = harness({
      nodes: [user(1, 'fix it'), tool(2, 'c1', 'Read a.ts'), assistant(3, [{ kind: 'text', text: 'Done.' }])],
    })
    const view = render(<ActivityGroup {...h.props} />)
    expect(view.getByTestId('seat-fixture:tool:c1')).toBeTruthy()
    expect(view.queryByRole('button', { expanded: false })).toBeNull()
  })

  it('follows a member that gains prose while streaming', async () => {
    const h = harness({
      nodes: [
        user(1, 'fix it'),
        assistant(2, [{ kind: 'reasoning', text: 'thinking' }]),
        tool(3, 'c1', 'Read a.ts'),
      ],
    })
    const view = render(<ActivityGroup {...h.props} />)
    expect(view.queryByRole('button', { expanded: false })).toBeTruthy()
    await act(async () => {
      h.store.set(snapshot(chatSnapshotFixture({
        nodes: [
          user(1, 'fix it'),
          assistant(2, [
            { kind: 'reasoning', text: 'thinking' },
            { kind: 'text', text: 'Here it is.' },
          ]),
          tool(3, 'c1', 'Read a.ts'),
        ],
      }, h.chat)))
    })
    expect(view.getByTestId('seat-fixture:assistant:2')).toBeTruthy()
    // The fold is gone once its step speaks: every row renders as itself.
    expect(view.queryByRole('button', { expanded: false })).toBeNull()
    expect(view.getByTestId('seat-fixture:tool:c1')).toBeTruthy()
  })
})
