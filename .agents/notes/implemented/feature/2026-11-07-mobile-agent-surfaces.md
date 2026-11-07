# Agent Note: Operating the agent from a phone

Status: implemented

English | [中文](2026-11-07-mobile-agent-surfaces.zh.md)

## Problem

[The phone layout](2026-11-06-phone-layout-shell.md) gave the shell one surface — the conversation — and left the surfaces the agent is actually operated through behind. A tool call's detail was unreachable: the frame refused `openDetails()` on the phone and the column resolved to zero width. The approval and question takeovers arrived with pointer-shaped geometry: right-aligned 36px actions, a 336px body cap, and no relationship to the live viewport, so a phone with the keyboard open could push the answers off the screen.

## Decision

**The detail is the same panel, rendered as a second surface.** `ui-layout` no longer refuses a details request on the phone; the width preference keeps deciding whether the panel shows, and `AppFrame` turns that flag into a full-screen sheet over the conversation instead of a track. `DetailsPanel` needs no second implementation and no new state: closing still comes from its own button, and the existing "a different Session closes details" rule closes the sheet too. `openDetails`/`closeDetails` remain the only entry points the tool cards already call.

**The sheet hides through visibility, not a transform.** A transformed ancestor becomes the containing block for `position: fixed` descendants, so animating the sheet would displace anything fixed inside it. The same trap already affects `ui-settings`, whose panel is a fixed descendant of the sidebar column that Phase 9 animates with `translateX`; that one is the next phase's problem, and this decision keeps the details sheet out of it.

**The takeovers reflow against the viewport.** The approval card stacks its two answers at full width with the primary at the bottom, and caps the justification body at `min(50dvh, …)`; the question and plan-review cards cap at `min(60dvh, 520px)` with a `vh` fallback and let their footers wrap instead of overflowing. Touch targets keep the sizes the primitives already provide — 36px buttons, 40px question options — and the sheet's own close control grows to 36px on the phone.

## Alternatives considered

**A separate mobile sheet component registered in an overlay slot.** Rejected because the details panel is already the owner of its own slot content: a second component would either duplicate the panel or need the slot to be rendered outside the frame, which the slot system forbids — a plugin renders only the slots it declares.

**Animating the sheet with `translateX` like the drawer.** Rejected for the containing-block trap above. Visibility and opacity cost the slide but keep every fixed element inside the panel relative to the viewport.

**Gestures to dismiss the sheet.** Rejected for this phase: the panel's close button already exists and is the affordance the desktop uses, and a swipe would need pointer tracking with no other surface asking for it.

**Keeping the details panel unreachable on the phone.** Rejected because it is what forces a user back to the desktop to read a tool call's arguments, which is the loop this phase exists to close.

## Consequences

From a phone a user can read a tool call's detail, answer an approval, and answer a question without leaving the device. Above the breakpoint nothing changes: the details column keeps its drag handle and concession behaviour, and the takeovers keep their right-aligned single-row actions.

The costs are explicit. The sheet shares the desktop width preference, so a phone can open on a panel the desktop sized — harmless because the sheet ignores the width, but it means the phone has no independent "open" state. Settings stay unreachable on the phone until the transform trap is fixed, because that panel is a fixed descendant of an animated ancestor. Device verification of these surfaces remains a manual step: the agent environment cannot start a browser, so the committed e2e scenario runs in CI instead.
