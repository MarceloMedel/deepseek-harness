// @vitest-environment jsdom
// Chat density: the durable preference behind the three display levels, and
// the General Settings row that writes it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { DensityRow } from '../src/client/settings/DensityRow.tsx'
import type { DensityRowProps } from '../src/client/settings/DensityRow.tsx'
import { ChatDensityPreference } from '../src/client/chat/density-preference.ts'
import { DEFAULT_CHAT_DENSITY, type ChatDensity, type ConversationSettings } from '../src/conversation-settings.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function section(chatDensity: ChatDensity): ConversationSettings {
  return { busyEnter: 'queue', chatDensity }
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

function mount() {
  const preference = new ChatDensityPreference()
  const setDensity = vi.fn((density: ChatDensity) => { preference.setDensity(density) })
  const props: DensityRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useDensity: bindSnapshotSelector(preference.density),
    setDensity,
    t: makeTranslate(en),
  }
  render(<DensityRow {...props} />)
  return { preference, setDensity }
}

describe('ChatDensityPreference', () => {
  it('defaults to compact and stays process-local without a scope', () => {
    const preference = new ChatDensityPreference()
    expect(preference.density.getSnapshot()).toBe(DEFAULT_CHAT_DENSITY)
    preference.setDensity('balanced')
    expect(preference.density.getSnapshot()).toBe('balanced')
  })

  it('publishes the choice before writing it, and never rewrites an identical value', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const observed: string[] = []
    const scope: typeof host.scope = {
      ...host.scope,
      set: (field, value) => {
        observed.push(`${field}=${String(value)}:${preference.density.getSnapshot()}`)
        return host.scope.set(field, value)
      },
    }
    const preference = new ChatDensityPreference(scope)
    preference.setDensity('detailed')
    expect(observed).toEqual(['chatDensity=detailed:detailed'])
    expect(host.set).toHaveBeenCalledOnce()
    preference.setDensity('detailed')
    expect(host.set).toHaveBeenCalledOnce()
  })

  it('adopts a value the Host already holds without writing it back', () => {
    const host = stubSettingsScope<ConversationSettings>()
    host.publish({ status: 'ready', value: section('balanced'), revision: 1, writable: true })
    const preference = new ChatDensityPreference(host.scope)
    expect(preference.density.getSnapshot()).toBe('balanced')
    preference.setDensity('balanced')
    expect(host.set).not.toHaveBeenCalled()
  })
})

describe('DensityRow', () => {
  it('explains the scope and shows the compact default', () => {
    mount()
    expect(screen.getByText('Chat density')).toBeDefined()
    expect(screen.getByText('How much intermediate work the chat shows by default')).toBeDefined()
    expect(screen.getByRole('button', { name: /Compact/ })).toBeDefined()
  })

  it('writes the chosen level and follows later preference changes', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: /Compact/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Detailed' }))
    expect(b.setDensity).toHaveBeenCalledWith('detailed')
    expect(screen.getByRole('button', { name: /Detailed/ })).toBeDefined()

    act(() => { b.preference.setDensity('balanced') })
    expect(screen.getByRole('button', { name: /Balanced/ })).toBeDefined()
  })
})
