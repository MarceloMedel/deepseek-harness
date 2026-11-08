# Agent Note: Inlined fonts hid their own redundant faces

Status: implemented

## Problem

The build's font pipeline matched formats by emitted file name. `dropRedundantFonts` collects the name stem of every `.woff2` asset in the bundle and deletes the `.woff` and `.ttf` assets that share a stem, which removed two thirds of every KaTeX face.

`KaTeX_Size3-Regular.woff2` is 4.2 KB, under Vite's 4 KB inline limit, so Vite wrote it into `vendor.css` as a `data:font/woff2;base64` URI instead of emitting a file. With no `.woff2` asset in the bundle for that stem, the plugin had nothing to match and kept `KaTeX_Size3-Regular-*.woff` and `-*.ttf` — 12 KB the container served and no browser ever needed. Measuring `WEB-06` inside the container found the pair; the earlier validation had attributed it to a family that ships no woff2 at all, which was wrong.

## Decision

`apps/web/vite.config.ts` sets `assetsInlineLimit` so font extensions never inline. Faces stay separate files, whatever their size.

The inline limit is a good default for the small icons and SVG data the shell embeds, and a bad one for fonts: an inlined face puts its bytes in the render-blocking stylesheet, where its own request can neither revalidate it nor drop it when the face is unused, and it hides the face from any plugin that reasons about emitted names.

## Alternatives considered

Raising the inline limit above every face was rejected: it would move several hundred kilobytes of base64 into the render-blocking stylesheet, which is the opposite of what the payload budget asks. Deleting the surviving pair by file name was rejected because the plugin's rule — a face is redundant when the same stem ships a woff2 — is the correct one; the defect was the missing emitted name, not the rule.

## Consequences

The build now emits 20 woff2 faces (300 KB) and no other format, and the CSS no longer carries the base64 copy. Any future asset whose redundancy is decided by file name must not be inlined; the comment on `assetsInlineLimit` states that reason at the setting.

Verification is by build output, not by test: `find apps/web/dist \( -name '*.woff' -o -name '*.ttf' \)` is empty and `grep 'data:font' apps/web/dist/assets/*.css` matches nothing. A built-plane test would catch a regression, and none exists today.
