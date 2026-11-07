# Agent Note: Runs of work fold into one row, and the live action into one line

Status: implemented

## Problem

A turn in the web conversation painted one row per event: every Assistant step contributed a `Think` row with a one-line preview, and every Tool call contributed its own summary row. A task of thirty steps therefore produced forty-odd rows of equal weight, and because `ChatView` follows the tail while the turn runs, that column moved at model speed past a reader who could not read it. The one element that answered "what is it doing now" — the in-flow `Deep diving...` status — lived inside the same scrollport, so it left the screen exactly when it was needed.

The density was not the only issue. Nothing in the flow told a reader that six consecutive rows belonged to one piece of work, and nothing outside the flow said what the agent was doing at any moment.

## Decision

**Consecutive Activity nodes of one turn render as one collapsed row.** A run is a maximal sequence of `assistant-step` nodes carrying no prose of their own and `tool-call` nodes that share a turn; `ChatView` cuts the order at every other node and at every turn boundary. The collapsed row names the calls the run made with `ToolCallView.title`, the title the tool itself publishes for its card, followed by the repeat count, the number of reasoning blocks, and the run's wall time. While it stays closed it also previews the last line of the run's final reasoning block.

**Expanding the row renders the seats it already had.** `ActivityGroup` mounts the same `ChatNodeSeat` per member, so the Think rows, the Tool rows, their cards, their Inspect handoff, and their expand state are the ones this bundle already ships; the fold adds a boundary and a summary, not a second presentation.

**The Think row keeps its own contract where it renders.** Reasoning inside a folded run is reachable through the run's expand, and a Think row that does render still owns its live tail-follow summary and its expand-to-full-text behavior ([thinking tail scroll](2026-08-02-web-thinking-tail-scroll.md)).

**Nothing that answers the user is folded.** A member that paints prose, an image, or an unknown block keeps its own seat and cuts the run in two, so a run's summary can never contain the answer. A failed call keeps the first line of its failure and its error state on the collapsed row. A run of one node is not a fold and renders exactly as before.

**A call selected from the details panel opens the row that holds it.** The inspect path from the details panel and from a Tool row's `Inspect` action still reveals the call it points at, because an outside selection outranks the row's own closed state.

**The live action is one docked line.** `LiveActivity` registers on `conversation.input.dock` at `order: 10`: a single line above the composer card, outside the scrollport, showing the call in flight with its Host title, or a working label between calls, plus the running turn's clock. It renders nothing while no turn runs, and it replaces the in-flow status, so "what is happening now" has one home and it cannot scroll away.

**The fold is presentation over existing nodes.** No session event, no wire field, and no model input changes: the grouping reads Chat Node kinds and locations the conversation view already holds, and the call titles ride the `ToolCallView` the host computed for the call's own card. Grouping rides the order — a key's kind and turn never change — so streaming deltas do not re-run it, while membership is read through the same per-key selector the plain seat uses, which is what lets a step that starts speaking mid-stream leave the fold and render its prose.

## Alternatives considered

**Fold on settle: detailed rows while the turn runs, one digest row once it ends.** Rejected by the product owner in favor of a calm transcript from the first row: the live line carries what is happening, so the flow never has to be the live surface, and no reflow is needed at `turn/end`.

**Keeping the in-flow status next to the new docked line.** Rejected because two elements would answer the same question: the in-flow one is the one that scrolls away, and it would render a second copy of the same state the dock already shows.

**A summary seat that `ui-tool` owns for the collapsed title.** Rejected once `ToolCallView.title` proved sufficient: the tool already publishes the sentence its own card header shows, so a new composition point would exist only to re-derive a string the wire already carries, and it would couple `ui-conversation`'s row chrome to a second package's registration lifecycle for nothing.

**Deciding fold membership inside the collapsed row only.** Rejected because the row must know where the run starts and ends, which is a property of the whole ordered list: a member cannot see its siblings.

**Computing group membership from node content inside `ChatView`.** Rejected because `ChatView` deliberately does not re-render on Assistant deltas — only on order changes — so a run boundary that depends on a member's text would go stale the moment that member started speaking. The boundary decision therefore sits behind a subscription to the members themselves.

**Folding whole turns, prose included.** Rejected: it would hide the assistant's answer behind a summary row, which is the one thing a conversation must never do.

**Shipping a persisted density preference (Compact, Balanced, Detailed) in the same change.** Deferred here, then shipped as its own decision: the fold plus its expand is the detail affordance this change needed, and the preference waited until the new default had been read once ([chat density](2026-11-07-web-chat-density-preference.md)).

## Consequences

A long turn reads as a handful of rows: the assistant's prose, one row per run of work naming the work, and the failures still visible. Reading what a specific call did costs one click on the run that contains it, or the existing Inspect path into the details panel, and the Trajectory tab still holds the complete ledger for a reader who wants the full sequence.

The trade-offs are real. A collapsed run shows call titles but not their arguments, so a reader who wants to know what a command actually ran must expand the row or open the call's detail. The live line repeats the current call while that call's own row may also be on screen — deliberate duplication, because the row scrolls and the line does not. The last-thought preview is one line of one block: it reports what the agent was thinking at the end of a run, not the shape of the reasoning.

Verification: `pnpm run test:gui` (3807 passing, 1 skipped) covers the model, the fold, the live line, and the ChatView integration; `tsc -b tsconfig.client.json` and oxlint are clean. The fold's real geometry at a phone width and its feel against a live model stream remain a manual check, which this environment cannot run.
