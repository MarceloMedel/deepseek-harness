# Agent Note: A cancel cannot silently discard a pending question

Status: implemented

## Problem

`ask_user_question` pauses a turn until a human answers, and the pause is bound to the turn's abort signal: any cancel of that turn destroys the question on **every** attached client, because the host broadcasts `question/resolved` to all of them. In this deployment the observable result was a dialog that appeared and vanished with nobody touching it: a session open in two places means a Stop pressed in either one, deliberately or by a stray tap, silently discards a question the other screen was in the middle of reading. Seven of sixteen questions asked in one session died that way, at open durations from 14 s to 6,473 s.

The failure was also self-concealing. The provider rejected with `ask_user_question was aborted before the user answered` (`ASK_ABORTED`), which reads as the human declining to answer or missing a deadline. It sent every investigation after a timer that does not exist — there is none: the question path has no `setTimeout`, no unmount cleanup, and no unload hook, and the durations were arbitrary. The transcript named the wrong actor.

## Decision

The proxy that owns both the pending questions and the `cancel` RPC now decides the two cases separately.

`cancel` refuses the first request while that session has a pending question, answering the RPC with the new `question-pending` code whose details name the session and the pending question's `rpcId`. The refusal is not a dead end: it arms that session for `QUESTION_CANCEL_REARM_MS` (15 s), and a repeat inside the window cancels the turn as asked. One stray press therefore costs an error message instead of the question, and the operator insisting is one more press away.

The abort path now reads the turn's cancellation cause. A `{kind: 'user'}` abort rejects as `ASK_TURN_CANCELLED` with `the turn was cancelled while the question was open; nothing was answered`; any other abort keeps `ASK_ABORTED` and its original text. The model and the transcript now say what happened.

## Alternatives considered

**Let the cancel through and close the card with a notice.** The cheapest change, and it keeps the operator's stop immediate. Rejected because it fixes only the narration: the question is still destroyed, and a dialog that explains itself while disappearing is not what a person mid-decision needs.

**Never allow a cancel while a question waits.** Simplest rule, and the question's own dismiss button already returns control to the model, so a stuck question is not unkillable. Rejected because it forces a dismiss before a stop, and the model may take another step in between — a worse outcome than a second press.

**Ask through the approval service for confirmation.** The harness already has a confirm-a-risky-action channel. Rejected as disproportionate ceremony for a keystroke: it would put a second modal in front of a control whose whole job is to be fast, and it would make the confirmation itself cancellable.

**Guard in the agent loop's `cancel`.** Would cover every caller rather than the web RPC. Rejected because the loop is transport-neutral and knows nothing about human interaction; the pending-question registry lives in the proxy, next to the RPC that has to consult it.

## Consequences

- A stop pressed while a question waits now returns `question-pending` once. The web client surfaces the message through `promptError`, and the question survives on every client.
- The 15-second window is a judgement, not a measurement: long enough that a deliberate double press reads as one intent, short enough that a stop hours later is asked again. It is a module constant beside the proxy's other timings rather than deployment configuration, because no deployment has a reason to differ.
- `ASK_TURN_CANCELLED` is model-visible and new: a tool result now distinguishes "the turn ended under me" from "the human did not answer". Anything matching the old string for a cancelled turn needs updating; nothing in this repository did.
- The refusal is per session and in-memory, so it dies with the process — the same lifetime as the pending questions it protects.
- `packages/host/apiproxy/tests/api-proxy-question.spec.ts` pins both halves: the refusal with the question still answerable afterwards, and the repeated cancel rejecting with `ASK_TURN_CANCELLED` while naming the turn.
