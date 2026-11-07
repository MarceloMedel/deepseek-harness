# Agent Note: Phone layout for the web shell

Status: implemented

## Problem

The shell's narrow tier stopped at an auto-collapsed 56px rail. On a 390px phone that rail spent 14% of the width, never became the session list, and the details column could not open at all (`computeColumns` resolves it to zero below ~1000px). The header carried three pieces of chrome a phone cannot act on: the session's agent-preset label, the view tab strip, and the session-log download capsule. Composer controls were pointer-sized (28px chips, a 34px send circle), and the shell pinned itself to `height: 100%` of the layout viewport, which a mobile URL bar and keyboard do not shrink.

## Decision

**The phone is a third layout tier in `ui-layout`, not a separate shell.** `AppFrame` decides it from the width it already measures with its own `ResizeObserver` (`MOBILE_MAX = 767`), keeps all three grid tracks (`minmax(0, 1fr) 0px 0px`) so the off-flow sidebar and the empty details column never become implicit rows, and takes the sidebar column out of the flow as a sliding drawer. `computeMobileColumns` owns that solve. The store gains `mobile` and `drawerOpen`; `toggleSidebar` flips the drawer there instead of a width preference, `openDetails` is refused, and both breakpoint crossings drop the drawer.

**The frame owns the phone chrome.** The menu control and the scrim are rendered by `AppFrame` itself rather than by another plugin: the sidebar slot can only be rendered by the frame that declares it, so no plugin can move the session list into a drawer. Stacking inside the frame is shell overlay (20) < scrim (21) < menu (22) < drawer (23), the scrim exists only while the drawer is open (a click-through layer over the conversation would swallow every tap), and the drawer holds the WIDE sidebar — the rail is a desktop affordance a phone has no width to spend.

**Chrome geometry crosses packages as owner props, never as selectors.** The frame passes `headerInset` and `mobile` into the `conversation` slot; the conversation turns the inset into the `--dsh-header-inset` custom property on its own root so the header clears the menu control, and reduces the view ring to Chat in both the header and the body so the tab strip disappears and a selection carried over from a wider layout resolves to Chat instead of a ledger the column cannot hold.

**Two surfaces hide themselves in their own stylesheet.** `ui-agent-preset` hides the header label and `session-log-export` hides the download capsule under `@media (max-width: 767px)`. Retiring either from the composition was rejected: the composition cannot vary by device, because one URL serves the phone and the desktop. `ui-conversation` sizes the composer's chips, select, and send circle to 36px on the same breakpoint and pads the composer seat with `env(safe-area-inset-bottom)`; `ui-layout`'s locale namespace supplies the menu control's name; the shell's base sheet moves to `100dvh`, and `apps/web` declares `viewport-fit=cover`, `interactive-widget=resizes-content`, `theme-color`, and a `standalone` manifest.

## Alternatives considered

**A fork-owned mobile shell plugin registering into `shell.overlay`.** Rejected on capability, not taste: a plugin renders only the slots it declares, so it could add chrome but never host the `sidebar` slot inside a drawer. It would have produced duplicated chrome around an unmovable session list.

**Hiding the tab strip and the other chrome from the frame's stylesheet with cross-package selectors.** Rejected because the prototype's `div:has(> [data-shell-overlay])`-style selectors reach into another package's DOM and its hashed class names. Owner props state the same fact through the sanctioned channel, and the hiding rules live in the packages that own the elements.

**Removing `ui-trajectory` and the export command from a phone profile.** Rejected because the profile cannot vary per device; a phone and a desktop share one URL. The view stays registered and stays reachable on wider layouts.

**Forcing the view through CSS only.** Rejected because hiding the strip leaves a persisted Trajectory selection rendering on the phone with no way back. Reducing the ring in JS gives the strip and the body one source of truth.

## Consequences

A phone gets the full width for the conversation, a drawer for sessions and workspaces, and no header chrome it cannot use. Choosing a session closes the drawer, and no column edge can be dragged where the columns overlap. The desktop layout is unchanged above the breakpoint, which the replayed web snapshots and the 1280px leg of the new e2e scenario both pin.

The costs are explicit. The phone has no details panel and no Trajectory until a follow-up specification gives them sheet surfaces; `/export` still exists as a command even though its button is hidden; and the drawer's closing gesture is the scrim or the sidebar's own toggle, because the frame cannot observe a session click landing inside another package's slot. The prototype that settled the shape was a dynamic Cordis client plugin whose CSS selected across package boundaries; it is not part of the shipped code.
