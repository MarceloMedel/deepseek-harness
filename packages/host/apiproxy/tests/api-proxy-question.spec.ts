import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { ApiProxy, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

async function harness(): Promise<{ ctx: Context; api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  return {
    ctx,
    api: createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }),
  }
}

function agent(ctx: Context): Agent {
  const session = ctx.sessions.create()
  const value = { id: session.id, session, status: 'idle', ctx } as Agent
  ctx.agents.register(value)
  return value
}

function openMux(api: ApiProxy, abort: AbortController): {
  envelopes: RpcRequest<MuxFrame>[]
  waitForQuestion(): Promise<RpcRequest<Extract<MuxFrame, { type: 'question/requested' }>>>
} {
  const envelopes: RpcRequest<MuxFrame>[] = []
  let resolveQuestion!: (value: RpcRequest<Extract<MuxFrame, { type: 'question/requested' }>>) => void
  const question = new Promise<RpcRequest<Extract<MuxFrame, { type: 'question/requested' }>>>((resolve) => {
    resolveQuestion = resolve
  })
  void (async () => {
    for await (const envelope of api.events.mux({ rpcId: RpcId('question-mux'), payload: {} }, abort.signal)) {
      envelopes.push(envelope)
      if (envelope.payload.type === 'question/requested') {
        resolveQuestion(envelope as RpcRequest<Extract<MuxFrame, { type: 'question/requested' }>>)
      }
    }
  })()
  return { envelopes, waitForQuestion: () => question }
}

function answer(
  envelope: RpcRequest<Extract<MuxFrame, { type: 'question/requested' }>>,
  selected: string[],
  custom?: string,
): Parameters<ApiProxy['respond']>[0] {
  return {
    type: 'client-response',
    rpcId: envelope.rpcId,
    result: {
      ok: true,
      value: {
        sessionId: envelope.payload.sessionId,
        answer: {
          answers: [{
            id: envelope.payload.questions[0]?.id,
            selected,
            ...custom === undefined ? {} : { custom },
          }],
        },
      },
    },
  }
}

describe('question response validation', () => {
  it('accepts selected options with custom text for multi-select questions', async () => {
    const { ctx, api } = await harness()
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const asked = ctx.userQuestions.ask({
      agent: agent(ctx),
      questions: [{
        id: 'targets',
        question: 'Choose targets and add another',
        multiSelect: true,
        options: [{ label: 'Code' }, { label: 'Docs' }],
      }],
    })
    const envelope = await mux.waitForQuestion()

    expect(await api.respond(answer(envelope, ['Code', 'Docs'], 'Release notes')))
      .toEqual({ accepted: true })
    await expect(asked).resolves.toEqual({
      answers: [{ id: 'targets', selected: ['Code', 'Docs'], custom: 'Release notes' }],
    })
    expect(mux.envelopes.some(item => item.payload.type === 'question/resolved')).toBe(true)
    abort.abort()
  })

  it('keeps selected options and custom text mutually exclusive for single-select questions', async () => {
    const { ctx, api } = await harness()
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const asked = ctx.userQuestions.ask({
      agent: agent(ctx),
      questions: [{
        id: 'target',
        question: 'Choose one target',
        options: [{ label: 'Code' }, { label: 'Docs' }],
      }],
    })
    const envelope = await mux.waitForQuestion()

    expect(await api.respond(answer(envelope, ['Code'], 'Release notes')))
      .toEqual({ accepted: false, reason: 'bad-response' })
    expect(await api.respond(answer(envelope, [], 'Release notes')))
      .toEqual({ accepted: true })
    await expect(asked).resolves.toEqual({
      answers: [{ id: 'target', selected: [], custom: 'Release notes' }],
    })
    abort.abort()
  })
})

let nextCancelRpc = 1
function cancelRequest(sessionId: SessionId): RpcRequest<{ sessionId: SessionId }> {
  return { rpcId: RpcId(`cancel-${String(nextCancelRpc++)}`), payload: { sessionId } }
}

/** An agent whose `cancel` aborts the phase signal the question was asked under. */
function runningAgent(ctx: Context, phase: AbortController): { agent: Agent; cancel: ReturnType<typeof vi.fn> } {
  const session = ctx.sessions.create()
  const cancel = vi.fn(() => { phase.abort({ kind: 'user' }) })
  const value = { id: session.id, session, status: 'running', ctx, cancel } as unknown as Agent
  ctx.agents.register(value)
  return { agent: value, cancel }
}

describe('cancel while a question waits', () => {
  it('refuses the first cancel and leaves the question answerable', async () => {
    const { ctx, api } = await harness()
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const phase = new AbortController()
    const { agent: live, cancel } = runningAgent(ctx, phase)

    const asked = ctx.userQuestions.ask({
      agent: live,
      questions: [{ id: 'target', question: 'Choose one target', options: [{ label: 'Code' }] }],
      signal: phase.signal,
    })
    const envelope = await mux.waitForQuestion()

    const refused = await api.sessions.cancel(cancelRequest(live.id))
    expect(refused.result.ok).toBe(false)
    if (!refused.result.ok) {
      expect(refused.result.error.code).toBe('question-pending')
      expect(refused.result.error.details).toEqual({ sessionId: live.id, questionRpcId: envelope.rpcId })
    }
    expect(cancel).not.toHaveBeenCalled()

    expect(await api.respond(answer(envelope, ['Code']))).toEqual({ accepted: true })
    await expect(asked).resolves.toEqual({ answers: [{ id: 'target', selected: ['Code'] }] })
    abort.abort()
  })

  it('accepts the repeated cancel and names the turn as the reason the question died', async () => {
    const { ctx, api } = await harness()
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const phase = new AbortController()
    const { agent: live, cancel } = runningAgent(ctx, phase)

    const asked = ctx.userQuestions.ask({
      agent: live,
      questions: [{ id: 'target', question: 'Choose one target' }],
      signal: phase.signal,
    })
    await mux.waitForQuestion()

    const refused = await api.sessions.cancel(cancelRequest(live.id))
    expect(refused.result.ok).toBe(false)

    const accepted = await api.sessions.cancel(cancelRequest(live.id))
    expect(accepted.result.ok).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(1)
    await expect(asked).rejects.toMatchObject({
      code: 'ASK_TURN_CANCELLED',
      message: 'the turn was cancelled while the question was open; nothing was answered',
    })
    abort.abort()
  })
})
