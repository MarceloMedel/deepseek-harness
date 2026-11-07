# Agent Note: The chat's display density is a durable preference

Status: implemented

## Problem

[The activity fold](2026-11-07-web-activity-fold-and-live-line.md) made one display behavior the only one: every run of work renders as a single collapsed row. A reader who wants to follow a call per call has to expand every run, and a reader who wants to watch the reasoning has to open every Think row, so the same transcript serves two opposite reading styles badly. The choice is durable, not per conversation: it is how a person reads, not what one session contains.

## Decision

**`ui-conversation.chatDensity` is a durable scalar with three accepted values and default `compact`.** `compact` folds each run of work into one row, `balanced` gives every Assistant step and every Tool call its own row without folding, and `detailed` renders those same rows with each step's reasoning already open. The Host user-settings document holds the value, beside `busyEnter`, so it follows the user home across ports and reloads.

**One General Settings row writes it.** `DensityRow` registers as a second `settings.general.item` in `ui-conversation` at `order: 21`, using the same selector primitive as the Enter-behavior row, and reads the live value through the entry's inject `hooks` compartment.

**The value reaches the flow as owner currency.** The chat-view registration injects `hooks: { density }`; `ChatView` reads it once, decides whether to fold, and passes it in `ChatNodeOwnerProps`, which every keyed Chat renderer already receives. `AssistantNodeView` turns `detailed` into `expandReasoning`, which `AssistantMarkdown` hands to each `ReasoningRow` as its initial open state. A reader's own toggle still owns the row afterwards.

**Both shipped preferences read their value through one seam.** `bindPreference` owns adoption from the settings scope, no-write-back on an unchanged value, local publication before the write crosses the wire, and process-local behavior when no scope exists; `ComposerSubmissionPolicy` and `ChatDensityPreference` each project one field through it. The settings file is `conversation-settings.ts` because it now carries two preferences, not the submission policy alone.

**The live activity line does not read the density.** It reports what is happening now, which every density wants; only the record of what already happened is a matter of taste.

## Alternatives considered

**A per-session density.** Rejected: the same reader keeps one reading style across sessions, and a per-session value would need a session event (the log is the only home for state that outlives a mount) for a preference the user sets once.

**A quick toggle in the session header instead of a Settings row.** Rejected for this change: the header already carries the title, view tabs, and the session-context controls, and the preference is not frequent enough to earn permanent chrome. The Settings row is where the plugin's other preference already lives.

**Expanding each Tool card in `detailed`.** Rejected: a tool card's open state belongs to the Tool renderer in `ui-tool`, whose public API this work does not widen, and an expanded run of terminal cards would bury the answer it sits beside. The reasoning is what `detailed` is for.

**Two levels (folded and unfolded).** Rejected: unfolding alone produces the per-step rows without making the reasoning reachable, which is the half of the request the fold answers worst.

**Storing the value in browser storage.** Rejected: `MDL` product rule and the existing preference both put durable user state in the Host settings document, so a phone and a desktop share one choice.

## Consequences

The transcript now serves both reading styles without a plugin or a second view. The cost is one more Settings row and one more field in a section whose schema is validated at the Host boundary, and `detailed` can be heavy on a long turn: the reasoning of every step is laid out in the flow, so the fold's compactness is unavailable while that density is active — by definition, since compact is what the reader declined.

Verification: `chat-density.client.spec.tsx` covers the default, publication-before-write, deduplication, adoption without write-back, and the Settings row; `host.client.spec.ts` covers the schema accepting and rejecting values; `chat-view.client.spec.tsx` covers unfolded rendering under both non-default densities; `reasoning-row.client.spec.tsx` covers the reasoning starting open and the reader closing it. `pnpm run test:gui` passes (3815 passing, 1 skipped), as do `tsc -b tsconfig.client.json` and oxlint. The visual review of the row and of the three densities needs a browser this environment cannot start, so it remains manual.
