# Agent Note: The browser payload is compressed, cache-validated, and measured in faces

Status: implemented

## Problem

The shell served from the container reached the phone uncompressed and unvalidated. `apps/web/dist` was 12 MB on disk and about 5.5 MB without source maps: a 417 KB `index` chunk, a 727 KB `vendor` chunk carrying KaTeX, shiki and the markdown pipeline, 63 KB of CSS, 1.05 MB of KaTeX fonts, and 507 KB of install icons. On first load the browser fetched roughly 1.2 MB of shell, then up to 3.0 MB across 49 client-plugin bundles.

Neither layer compressed anything. `mdl/docker/nginx.conf` proxied without `gzip`, and `dsh-host-frontend-static` answered every file with a `content-type` and nothing else, so a content-hashed chunk carried no cache directive at all. `/plugins/<id>/client.js` answered `cache-control: no-cache` with no ETag, so the browser revalidated by refetching the entire body — 3.0 MB of plugin code per page load, on a phone, through a tunnel.

Each KaTeX face shipped in three formats for browsers from the woff era, and the two install icons were unoptimized PNGs at 256 KB and 170 KB.

## Decision

Compression belongs at the proxy, cache semantics at the origin.

`nginx.conf` enables `gzip` for the types the shell actually serves, which is where the 1.2 MB shell becomes about 330 KB and a full plugin roster becomes about 700 KB. The origin's job is narrower and more precise than compression: `frontend-static` now sends `cache-control: public, max-age=31536000, immutable` for anything under `assets/` — the subtree the build writes with a content hash in every name — and `no-cache` for the index document, the manifest, and the icons, whose names survive a rebuild. `client-modules` derives a content ETag for each plugin bundle and answers `304` on a match while keeping `no-cache`, so a reload of the same revision costs a header exchange instead of a body.

The build emits woff2 faces only. Vite hashes each font format separately, so the plugin that drops the redundant faces matches by name stem (everything before the content hash) rather than by swapping the extension; the build also refuses to inline a font, so every face keeps an emitted name to match ([why](2026-11-08-font-inlining-hides-redundant-faces.md)). Install icons are palette-quantized to 256 colors, 507 KB to 228 KB, at 39.6–41.2 dB PSNR against the originals.

Production does not publish source maps: the runtime tree deletes `apps/web/dist/**/*.map`, so the container neither stores nor serves application source.

## Consequences

The immutable directive is a promise tied to the build's naming contract. If a future asset under `assets/` loses its content hash, or a deploy writes different bytes to an existing hashed name, browsers keep the old copy for a year. The rule is stated where it is enforced — the `cache-control` helper's documentation names the hashed subtree as the reason — so the failure mode is visible to whoever changes it.

Plugin bundles deliberately stay `no-cache`: a running registry can replace `lib/client.js` behind a stable URL, so the ETag is the only safe validation. That keeps one header round trip per bundle per load and drops the body transfer.

Icon quantization changes pixel values. The measurement is recorded (PSNR per icon) because no human reviewed the art on a display in this change, and the install icons are the one surface where a wrong-looking logo survives every functional test.

The 727 KB `vendor` chunk is still on the first-load path: it is a static import of `index`. Deferring it means restructuring the math and highlight render path and verifying the result in a browser, so it remains scoped as its own change (`SPEC-018 § P6`) with its own measurement.

## Alternatives considered

**Compress in `frontend-static` with a streaming zlib.** Keeps compression at the origin, where it can be tuned per content type without touching the deployment's proxy configuration. Rejected because the proxy already terminates every request and compresses more cheaply than a Node process also doing work for the same requests, and a deployment behind a different proxy would have to disable the origin's compression to avoid double work.

**Hash-keyed `immutable` for plugin bundles too.** The URL carries a `?rev=` parameter, so it looks cacheable. Rejected because a rebuilt bundle can keep its revision while its bytes change during HMR, and a stale bundle in the browser is a broken UI with no recovery path.

**Drop the `.ttf` and `.woff` sources from the stylesheet instead of the emitted assets.** Cleaner contract, and it means editing a third-party stylesheet that upstream regenerates.

**Serve icons from a generated `srcset` with modern formats.** WebP or AVIF would be smaller than any PNG at these sizes. Rejected as a larger change than the payload problem required, and the icon budget is now small enough that the next win is elsewhere.

**Defer every heavy chunk, including shiki grammars.** The grammar chunks are already lazy; the boot grammars (TypeScript, shell, JSON) are on the first-load path by design, because a highlight request on the first message would otherwise stall on a network round trip.

## Verification

`packages/host/frontend-static` and `packages/client/modules` assert the directives through their real compositions — a hashed asset immutable, a name-stable file revalidated, a bundle `304` on a matching ETag and `200` on a stale one. Transfer sizes (`WEB-01`, `WEB-02`) need the container and a browser; `SPEC-018` records them as unverified rather than assumed.
