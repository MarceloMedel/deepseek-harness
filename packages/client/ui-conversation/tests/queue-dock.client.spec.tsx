// @vitest-environment jsdom
/**
 * QueueDock rendering and operations: authoritative rows, inline editing,
 * collapse state, removal, strict steering, failure notices, and live retirement.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import {
  EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ConversationSnapshot, QueuedMessage, SessionId, SessionListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { es as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/es.ts'
import type { QueueItemId } from '../src/client/contract/queue.ts'
import type { InputState } from '../src/client/input/contract.ts'
import { es } from '../src/client/locales.ts'
import { QueueDock, queueDockEntry, type QueueDockInjected, type QueueDockProps } from '../src/client/queue/QueueDock.tsx'

afterEach(cleanup)

const SID = 's1' as SessionId
const iid = (id: string): QueueItemId => id as QueueItemId

function row(id: string, text: string | null, preview = text ?? '[image]'): QueuedMessage {
  return {
    id: iid(id), messageId: `message-${id}` as never, placement: 'queued',
    content: text === null ? [{ type: 'image', data: 'x' } as never] : [{ type: 'text', text }],
    preview, text,
  }
}

function snapshotWith(queue: QueuedMessage[]): ConversationSnapshot {
  return {
    sessionId: SID, views: EMPTY_CONVERSATION_VIEWS, chat: EMPTY_CHAT_SNAPSHOT,
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue, running: true, composerPhase: 'active', removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: false, subagent: null, lastAgentError: null,
  }
}

/** Minimal live source backing the useSession stub. */
function liveSession(initial: ConversationSnapshot) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const useSession: SnapshotSelectorHook<ConversationSnapshot> = selector =>
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      () => selector(snapshot),
    )
  return {
    useSession,
    push(next: ConversationSnapshot): void {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** InputZone owner stub (the dock reads useSession only; the zone fields satisfy the owner share). */
const INPUT_STATE: InputState = { draft: '', imageIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [] }

// Standard locale seat stub mirroring the real ns → common → key chain.
const t: QueueDockProps['t'] = makeTranslate(es, commonZh)

function kitFor(snapshot: ConversationSnapshot, injected: Partial<QueueDockInjected> = {}) {
  return {
    sessionId: SID,
    t,
    useSessions: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<SessionListState>,
    useWorkspaces: (() => { throw new Error('unused') }) as never,
    useProjection: (() => undefined) as never,
    useInput: (() => { throw new Error('unused') }) as never,
    inputActions: { setDraft: () => {}, submit: () => {} } as never,
    session: snapshot,
    input: INPUT_STATE,
    updateQueue: vi.fn(() => Promise.resolve()),
    notify: vi.fn(),
    ...injected,
  }
}

describe('QueueDock', () => {
  it('renders null while the queue is empty', () => {
    const snap = snapshotWith([])
    const source = liveSession(snap)
    const { container } = render(<QueueDock {...kitFor(snap)} useSession={source.useSession} />)
    expect(container.innerHTML).toBe('')
  })

  it('leaves pending steering to the conversation flow', () => {
    const steering = { ...row('s-1', 'interrupt'), placement: 'steering' as const }
    const snap = snapshotWith([steering])
    const source = liveSession(snap)
    const { container } = render(<QueueDock {...kitFor(snap)} useSession={source.useSession} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders one row directly and defaults multiple rows to a collapsible count header', () => {
    const single = snapshotWith([row('i-1', 'one')])
    const source = liveSession(single)
    const view = render(<QueueDock {...kitFor(single)} useSession={source.useSession} />)
    expect(view.queryByRole('button', { name: '1 mensajes en cola' })).toBeNull()
    expect(view.getByText('one')).toBeTruthy()

    act(() => { source.push(snapshotWith([row('i-1', 'one'), row('i-2', 'two')])) })
    const header = view.getByRole('button', { name: '2 mensajes en cola' })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(header.getAttribute('aria-controls')!)).toBeTruthy()
    expect(view.queryByText('one')).toBeNull()
    expect(view.queryByText('two')).toBeNull()

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText('one')).toBeTruthy()
    expect(view.getByText('two')).toBeTruthy()

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByText('one')).toBeNull()
  })

  it('keeps an active single-row editor visible when another item arrives', () => {
    const single = snapshotWith([row('i-edit', 'before')])
    const source = liveSession(single)
    const view = render(<QueueDock {...kitFor(single)} useSession={source.useSession} />)

    fireEvent.click(view.getByLabelText('Editar mensaje en cola'))
    fireEvent.change(view.getByLabelText('Editar mensaje en cola'), { target: { value: 'draft' } })
    act(() => {
      source.push(snapshotWith([row('i-edit', 'before'), row('i-2', 'second')]))
    })

    const header = view.getByRole('button', { name: '2 mensajes en cola' })
    expect(header).toHaveProperty('disabled', true)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByRole('textbox', { name: 'Editar mensaje en cola' })).toHaveProperty('value', 'draft')
    expect(view.getByText('second')).toBeTruthy()

    fireEvent.click(view.getByLabelText('Cancelar la edición'))
    expect(header).toHaveProperty('disabled', false)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByText('second')).toBeNull()
  })

  it('keeps an in-flight row action visible when another item arrives', async () => {
    const single = snapshotWith([row('i-remove', 'remove me')])
    const source = liveSession(single)
    let finishUpdate: (() => void) | undefined
    const updateQueue = vi.fn(() => new Promise<void>((resolve) => { finishUpdate = resolve }))
    const view = render(
      <QueueDock {...kitFor(single, { updateQueue })} useSession={source.useSession} />,
    )

    fireEvent.click(view.getByLabelText('Quitar mensaje en cola'))
    act(() => {
      source.push(snapshotWith([row('i-remove', 'remove me'), row('i-2', 'second')]))
    })

    const header = view.getByRole('button', { name: '2 mensajes en cola' })
    expect(header).toHaveProperty('disabled', true)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText('remove me')).toBeTruthy()
    expect(view.getByText('second')).toBeTruthy()

    expect(updateQueue).toHaveBeenCalledOnce()
    await act(async () => {
      finishUpdate?.()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(header).toHaveProperty('disabled', false)
      expect(header.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('defaults a new multi-row queue to collapsed after the prior queue empties', () => {
    const first = snapshotWith([row('i-1', 'one'), row('i-2', 'two')])
    const source = liveSession(first)
    const view = render(<QueueDock {...kitFor(first)} useSession={source.useSession} />)
    fireEvent.click(view.getByRole('button', { name: '2 mensajes en cola' }))
    expect(view.getByText('one')).toBeTruthy()

    act(() => { source.push(snapshotWith([])) })
    expect(view.container.innerHTML).toBe('')
    act(() => {
      source.push(snapshotWith([row('i-3', 'three'), row('i-4', 'four')]))
    })

    const header = view.getByRole('button', { name: '2 mensajes en cola' })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByText('three')).toBeNull()
  })

  it('renders active actions and disables editing for mixed-content rows', () => {
    const snap = snapshotWith([
      row('i-1', '第一条排队消息'),
      row('i-2', null, 'image [image]'),
    ])
    const source = liveSession(snap)
    const { container, getByRole } = render(<QueueDock {...kitFor(snap)} useSession={source.useSession} />)
    fireEvent.click(getByRole('button', { name: '2 mensajes en cola' }))
    expect([...container.querySelectorAll('li')].map(item => item.textContent))
      .toEqual(['第一条排队消息', 'image [image]'])
    expect(container.querySelectorAll('button')).toHaveLength(7)
    expect(container.querySelectorAll('[aria-label="Editar mensaje en cola"]')).toHaveLength(2)
    expect(container.querySelectorAll('[aria-label="Quitar mensaje en cola"]')).toHaveLength(2)
    expect(container.querySelectorAll('[aria-label="Dirigir mensaje en cola"]')).toHaveLength(2)
    expect((container.querySelectorAll('[aria-label="Editar mensaje en cola"]')[0] as HTMLButtonElement).disabled).toBe(false)
    expect((container.querySelectorAll('[aria-label="Editar mensaje en cola"]')[1] as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelectorAll('[aria-label="Editar mensaje en cola"]')[1]?.getAttribute('title'))
      .toBe('Contiene contenido que no es texto; editar todavía no está soportado')
  })

  it('edits text inline with save and cancel controls, then saves with the same item identity', async () => {
    const snap = snapshotWith([row('i-edit', 'before')])
    const source = liveSession(snap)
    const updateQueue = vi.fn(() => Promise.resolve())
    const { getByLabelText, queryByLabelText } = render(
      <QueueDock {...kitFor(snap, { updateQueue })} useSession={source.useSession} />,
    )

    fireEvent.click(getByLabelText('Editar mensaje en cola'))
    const editor = getByLabelText('Editar mensaje en cola') as HTMLInputElement
    expect(getByLabelText('Guardar mensaje en cola')).toBeTruthy()
    expect(getByLabelText('Cancelar la edición')).toBeTruthy()
    expect(queryByLabelText('Quitar mensaje en cola')).toBeNull()
    fireEvent.change(editor, { target: { value: 'after' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(updateQueue).toHaveBeenCalledWith(iid('i-edit'), {
        kind: 'edit',
        content: [{ type: 'text', text: 'after' }],
      })
    })
  })

  it('cancels an edit by button or Escape without mutating the queue', () => {
    const snap = snapshotWith([row('i-edit', 'before')])
    const source = liveSession(snap)
    const updateQueue = vi.fn(() => Promise.resolve())
    const { getByLabelText, getByText } = render(
      <QueueDock {...kitFor(snap, { updateQueue })} useSession={source.useSession} />,
    )

    fireEvent.click(getByLabelText('Editar mensaje en cola'))
    fireEvent.change(getByLabelText('Editar mensaje en cola'), { target: { value: 'abandoned' } })
    fireEvent.click(getByLabelText('Cancelar la edición'))
    expect(getByText('before')).toBeTruthy()

    fireEvent.click(getByLabelText('Editar mensaje en cola'))
    fireEvent.keyDown(getByLabelText('Editar mensaje en cola'), { key: 'Escape' })
    expect(getByText('before')).toBeTruthy()
    expect(updateQueue).not.toHaveBeenCalled()
  })

  it('keeps editing during IME composition and disables a blank save', () => {
    const snap = snapshotWith([row('i-edit', 'before')])
    const source = liveSession(snap)
    const updateQueue = vi.fn(() => Promise.resolve())
    const { getByLabelText } = render(
      <QueueDock {...kitFor(snap, { updateQueue })} useSession={source.useSession} />,
    )

    fireEvent.click(getByLabelText('Editar mensaje en cola'))
    const editor = getByLabelText('Editar mensaje en cola')
    fireEvent.change(editor, { target: { value: '   ' } })
    expect(getByLabelText('Guardar mensaje en cola')).toHaveProperty('disabled', true)
    fireEvent.change(editor, { target: { value: 'Entrada中' } })
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    expect(updateQueue).not.toHaveBeenCalled()
    expect(getByLabelText('Editar mensaje en cola')).toBeTruthy()
  })

  it('removes the addressed row', async () => {
    const snap = snapshotWith([row('i-1', 'one'), row('i-2', 'two')])
    const source = liveSession(snap)
    const updateQueue = vi.fn(() => Promise.resolve())
    const { getAllByLabelText, getByRole } = render(
      <QueueDock {...kitFor(snap, { updateQueue })} useSession={source.useSession} />,
    )

    fireEvent.click(getByRole('button', { name: '2 mensajes en cola' }))
    fireEvent.click(getAllByLabelText('Quitar mensaje en cola')[0]!)
    await waitFor(() => {
      expect(updateQueue).toHaveBeenCalledWith(iid('i-1'), { kind: 'remove' })
    })
  })

  it('strictly steers complete row content only while the agent is running', async () => {
    const running = snapshotWith([row('i-steer', null, 'image [image]')])
    const source = liveSession(running)
    const updateQueue = vi.fn(() => Promise.resolve())
    const rendered = render(
      <QueueDock {...kitFor(running, { updateQueue })} useSession={source.useSession} />,
    )

    const button = rendered.getByLabelText('Dirigir mensaje en cola')
    expect(button).toHaveProperty('disabled', false)
    fireEvent.click(button)
    await waitFor(() => {
      expect(updateQueue).toHaveBeenCalledWith(iid('i-steer'), { kind: 'steer' })
    })

    act(() => { source.push({ ...running, running: false }) })
    expect(rendered.getByLabelText('Dirigir mensaje en cola')).toHaveProperty('disabled', true)
    expect(rendered.getByLabelText('Dirigir mensaje en cola').getAttribute('title')).toBe('Dirigir está disponible solo mientras el agente se ejecuta')
  })

  it('renders a session-backed subagent Queue without unsupported actions', () => {
    const snap = {
      ...snapshotWith([row('i-subagent', 'pending child follow-up')]),
      subagent: {
        address: {
          parentSessionId: 'parent' as SessionId,
          childSessionId: SID,
          mode: 'continuable' as const,
        },
        parentAvailable: true,
      },
    }
    const source = liveSession(snap)
    const view = render(
      <QueueDock {...kitFor(snap)} useSession={source.useSession} />,
    )

    expect(view.getByText('pending child follow-up')).toBeTruthy()
    expect(view.queryByLabelText('Editar mensaje en cola')).toBeNull()
    expect(view.queryByLabelText('Quitar mensaje en cola')).toBeNull()
    expect(view.queryByLabelText('Dirigir')).toBeNull()
  })

  it('keeps the row and reports a genuine steer failure', async () => {
    const snap = snapshotWith([row('i-steer-race', 'pending steer')])
    const source = liveSession(snap)
    const notify = vi.fn()
    const updateQueue = vi.fn(() => Promise.reject(new Error('transport failed')))
    const { getByLabelText, getByText } = render(
      <QueueDock {...kitFor(snap, { updateQueue, notify })} useSession={source.useSession} />,
    )

    fireEvent.click(getByLabelText('Dirigir mensaje en cola'))
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        'error',
        'Falló el direccionamiento. Reintentá.',
      )
    })
    expect(getByText('pending steer')).toBeTruthy()
  })

  it('keeps the row and surfaces a notice when an operation loses the claim race', async () => {
    const snap = snapshotWith([row('i-race', 'pending')])
    const source = liveSession(snap)
    const notify = vi.fn()
    const updateQueue = vi.fn(() => Promise.reject(new Error('not found')))
    const { getByLabelText, getByText } = render(
      <QueueDock {...kitFor(snap, { updateQueue, notify })} useSession={source.useSession} />,
    )

    fireEvent.click(getByLabelText('Quitar mensaje en cola'))
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('error', 'Falló la eliminación: puede que este mensaje ya se haya empezado a enviar.')
    })
    expect(getByText('pending')).toBeTruthy()
  })

  it('follows authoritative retirement back to null', () => {
    const snap = snapshotWith([row('i-1', '在场')])
    const source = liveSession(snap)
    const { container } = render(<QueueDock {...kitFor(snap)} useSession={source.useSession} />)
    expect(container.textContent).toContain('在场')
    act(() => { source.push(snapshotWith([])) })
    expect(container.innerHTML).toBe('')
  })

  it('registers as the terminal composer-context entry', () => {
    expect(queueDockEntry.name).toBe('conversation-queue-dock')
    expect(queueDockEntry.inject).toEqual(['slots', 'conversation', 'sessions'])
    const register = vi.fn(() => () => undefined)
    const inject = vi.fn((_name: string, callback: () => () => void) => callback())
    queueDockEntry.apply({ slots: { inject, register } } as never)
    expect(inject).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function))
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.dock', id: 'queue', order: 20 }),
      QueueDock,
    )
  })
})
