# Agent Note: The shipped product speaks English and Spanish; documentation speaks English

Status: implemented

## Problem

The product and its documentation were built Chinese-first. Every client catalog declared `zh` as the key-set source of truth and checked `en` against it, the shipped locale list was `['zh', 'en']`, and the documentation corpus carried 940 `.zh.md` siblings with 940 `.i18n.yaml` consistency records. Maintaining that second language had become a mechanism of its own: a pairing gate, a prompt contract, a briefed-update workflow, an automatic merge driver, and two `doc-sync` lanes.

The deployment's users read English and Spanish. Nobody read the Chinese documentation, and the Chinese interface was visible product surface for a locale no user selected. The cost was not bytes — the 654 Chinese catalog entries were 1.5% of the client bundles, and the documentation never reached the running app — it was that every documentation change carried a second, gated translation, and every catalog declared a language the product did not serve.

## Decision

Client copy ships in English and Spanish. Each `src/client/locales.ts` exports `en` as the key-set source of truth and `es` as `satisfies Record<Key, string>`, so a missing Spanish key is a compile error rather than a review miss. `LOCALE_IDS` is `['en', 'es']`, the language row offers English and Español, `FALLBACK_LOCALE` and `DOCUMENT_LANG` follow, and a browser whose language matches neither starts in English.

Documentation is English-only. The 940 `.zh.md` files and their `.i18n.yaml` records are deleted, and the machinery that maintained them is gone with them: `scripts/translation-*`, `verify-translation-*`, `gen-translation-brief`, `merge-translation-pairing`, the `dsh-translate-docs` skill, `docs/i18n/`, both `doc-sync` lanes, both `lefthook` hooks, and the bilingual merge driver the worktree installer registered. Gates that assumed a pair inject regions into, or project, one page per artifact.

The frozen Agent Note archive keeps its Chinese sidecars. `verify-archived-agent-notes` seals every byte of the archive and refuses modification, and the archive is history rather than product: nothing in it reaches the app, the site, or a build.

`MDL-LOCALE-01` in the personal development contract carries the replacement rule, and the two rules that described the product copy convention — the root `AGENTS.md` translation line and `packages/client/AGENTS.md`'s "Product copy is Chinese" — now state that copy comes from the locale catalogs.

## Consequences

A second product language is now cheap and a second *documentation* language is not: `es` costs a catalog entry per string and compiles into the same bundle, while translated docs would need a new owner, a new consistency mechanism, and a reviewer for each side. That asymmetry is deliberate — the interface is what users read, and the documentation is what maintainers read.

The consolidation of `en` into the source of truth removes a class of drift the old direction could not catch: a key added to `zh` and forgotten in `en` was a compile error, and the reverse was too, but the Chinese copy was also the only complete reference for tone. Spanish copy now follows the English strings, which are the product's own voice.

Reintroducing a documentation language needs an owner and a gate, not a file convention. The retired mechanism is recorded here rather than in code: paired siblings with equal authority, a blob-hash sidecar making consistency a content comparison, re-recording as an explicit reviewed act, and a merge driver so two branches editing different prose do not conflict on hashes. Any future attempt should start from that rationale rather than reinvent it, and should decide up front whether the second language is user-facing documentation or maintainer documentation.

The Chinese catalog entries and the documentation were 7.6 MB of the repository and 1.5% of the client payload; neither number justified the mechanism, and neither is the reason for this change.

## Alternatives considered

**Keep the pairing mechanism and translate Spanish instead of Chinese.** The mechanism is language-agnostic, so `es.md` siblings would have worked. Rejected because a second documentation language still needs a reviewer for each side, and this deployment has one reader of the documentation; the interface is where the Spanish belongs.

**Ship three locales (en, es, zh) with `en` as the source of truth.** Least destructive to the existing corpus, and it keeps a language nobody in this deployment selects as permanent surface area: 940 more documents to keep current, and a locale row that exists for no user.

**Keep the Chinese documentation and translate nothing.** The cheapest option, and it leaves a corpus where the authoritative copy of some documents is in a language the maintainer does not read, which is the failure mode the pairing gate was built to prevent.

**Machine-translate the documentation to Spanish.** Would produce a second corpus with no reviewer, and the pairing mechanism's whole point was that an unreviewed side silently lies.

**Leave the retired gates in place but unused.** Cheaper to review, and dead lanes that still resolve a pairing contract for a corpus that no longer exists invite someone to satisfy them again.

## Related

The archive exception, the frozen triplet format, and the append-only manifest belong to the [frozen archive](../../implemented/process/2026-07-26-frozen-agent-note-archive.md) decision, which this change does not alter.
