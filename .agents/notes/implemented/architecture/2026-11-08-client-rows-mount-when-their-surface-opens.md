# Agent Note: A client row mounts when its surface opens

Status: implemented

## Problem

The web shell created one Loader entry per graph row and required every one of them ACTIVE before switching from the loading page to the UI. That is the right guarantee — a half-composed UI is worse than a reported failure — but it made the first visit pay for the whole composition: 37 plugin bundles transferring 745.1 KB of a 1155.6 KB first load, of which the nine `immediately` rows were only a prefetch tier. `immediately` marks which bundles load *first*; it never decided which load at all.

The settings panel is the clearest case of paying for something unused. Five packages fill its sections and its per-feature rows — models (31.0 KB gzipped), agent presets (18.2), settings plugins (12.6), permission presets (5.6), plugin inventory (4.8) — and a visit that never opens settings fetched all of them. The measurement that made this concrete is in SPEC-018: a browser network panel with an empty cache against the container.

## Decision

A row declares when it arrives, and the shell mounts it then.

`dsh.client.surface` in a package's manifest names the surface the row belongs to. The host carries the name onto the boot graph row (`graphRow`), the parser exposes it as `BootPluginRow.surface`, and the kernel skips those rows when it builds the boot entries and the settle sweep. Declaring both `surface` and `immediately` fails the scan: a row that mounts on demand cannot also be a boot prefetch row, and the two fields together would mean nothing.

The kernel provides `ctx.clientSurfaces` before any entry exists. `open(name)` prefetches each row's factory (the same before-materialization rule the boot tier follows), creates the entries, awaits their fibers, and rejects with one line per row that did not activate. Repeated opens share the first attempt, and a failed attempt is forgotten so reopening the panel retries — a transient fetch error is exactly what a retry fixes. The sequencing and diagnostics live in `packages/client/web/src/surfaces.ts` behind seams, so the mechanism is tested without a browser.

The consuming feature names the surface, never a package. `ui-settings-general` injects `clientSurfaces`, and its trigger asks for `'settings'` before painting the panel: while the mount is in flight the trigger reports `aria-busy` and stays disabled, and a failed mount is loud in the console and still opens the shell, because a trigger that silently does nothing hides the failure behind an inert button.

## Alternatives considered

Deferring the bundle's own import until the surface opens, without touching the entry, was rejected: the entry's creation is what imports the bundle for its factory, so the two are the same step.

Splitting a bundle into several files was rejected on evidence: a client bundle is one CommonJS file per package served at exactly two routes (`/plugins/<id>/client.js` and its map), so per-surface chunks inside a package need an ESM multi-file contract across the build, the host, and the factory's external resolution.

Loading the settings rows when the browser is idle was rejected: it moves the bytes later without removing them, and the budget is about what a visit transfers.

## Consequences

Deferring the settings surface moved a browser measurement from 745.1 KB to 671.4 KB of plugin payload and from 1155.6 KB to 1055.2 KB of first load, and it put the `WEB-02` budget (≤700 KB) under its ceiling for the first time. `WEB-01` (≤400 KB) is still far away: the four largest bundles — conversation, runtime, trajectory, connection — stay on the boot tier, and only trajectory is genuinely deferrable.

Trajectory is the next surface and it needs a UI decision, not more mechanism: deferring it removes its tab from the conversation's view ring, because the ring projects registered views. That is a visible change in discoverability, so it stays out until the ring can offer a tab whose surface has not been mounted yet.

Every deferrable row costs a wait on first open (locally ~0.2 s for five bundles). A surface whose rows a boot-time surface already needs is not deferrable; `ui-directory-picker-browse` and `ui-model-selection` fill conversation and sidebar slots and stay on the boot tier for that reason.

The per-file coverage gate stays satisfied by the opener spec and the settings behavior specs; the assembled-browser lane could not be used as the gate for this change because 46 of its 70 files still locate UI copy in Chinese, which the language phase removed.
