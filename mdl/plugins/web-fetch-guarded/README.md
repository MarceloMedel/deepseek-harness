# dsh-web-fetch-guarded

One `ctx.web` fetch provider (`id: guarded`) that makes `web_fetch` safe to enable in a deployment which can reach internal services (SPEC-031).

## Why this exists

`@deepseek-ai/dsh-web-fetch-http` documents its own gap: without SSRF protection it "is an SSRF primitive and must not be enabled in a deployment that can reach sensitive internal network targets". This deployment reaches exactly those — `host.docker.internal:11434` (the host's Ollama), `searxng:8080` on the compose network, and loopback — so enabling the upstream provider unchanged would let a fetched page steer the model into reading internal endpoints.

## The guard

| Property | What it prevents |
|---|---|
| Validation runs on **resolved addresses** | A hostname that points somewhere private never opens a socket |
| The socket opens to the **validated address**, with the hostname kept in SNI and `Host` | DNS rebinding: the name cannot re-resolve to a different target between check and connect |
| Every **redirect hop** is re-validated, and only same-origin hops are followed | A public page bouncing the request into an internal one |
| Credentials in the URL are refused; only `http`/`https` | Smuggling a userinfo or another scheme past the resolver |
| Byte, character, redirect and wall-clock caps | A large or slow response holding the tool call |

Blocked ranges: `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `192.0.0/24`, `192.0.2/24`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4` and above; `::`, `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, `64:ff9b::/96`, `2002::/16`, `2001:0::/32`, `2001:db8::/32`, and the IPv4-mapped forms of all of the above.

## Config

| Key | Default | Meaning |
|---|---|---|
| `timeoutMs` | `30000` | Wall clock budget for one fetch, redirects included |
| `maxResponseBytes` | `5000000` | Raw bytes accepted before the response is refused |
| `maxBodyChars` | `100000` | Characters retained in the decoded body |
| `maxRedirects` | `5` | Same-origin hops followed |
| `maxUrlLength` | `2048` | Longest accepted URL |
| `userAgent` | `mdl-harness/1.0 (+web-fetch-guarded)` | Product identity sent to servers |

## Install

`install.sh [source-dir]` publishes the plugin into `$DSH_HOME/profiles/node_modules/dsh-web-fetch-guarded` and adds its rows to the profile's patch layer. The entrypoint runs it on every boot, so a recreated container converges.

The `web_fetch` tool row lives in this layer and not in a preset because presets are copy-only and the shipped ones set `fetch: false`; the global layer the preset merges into is the only place that enables the tool without forking a preset. `search: false` keeps the preset's `web_search` as the single owner of that name.

The `web` row is deliberately not patched: a patch entry replaces a row's whole `config`, so naming `fetchProvider` would erase `searchProvider: lite` from the search plugin's block. `fetch()` auto-selects while exactly one usable fetch provider is registered.

## Check

`check.mjs` is not copied into the volume by `install.sh` (same as the search plugin); run it from the repository against the installed module:

```sh
DSH_HOME=/data/dsh node mdl/plugins/web-fetch-guarded/check.mjs
```

It runs the offline address matrix, the URL rules, four live refusals (host Ollama, loopback, the compose-network motor, the link-local metadata address) and one live public fetch. It reports `skipped`, never `pass`, for a case whose target is absent.
