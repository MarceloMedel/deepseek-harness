# dsh-web-search-lite

One `ctx.web` search provider (`id: lite`) with a fixed four-link chain, replacing the third-party `dsh-web-search-multi` bundle (SPEC-026) with a file this deployment owns (SPEC-029).

## The chain

| # | Link | Needs | Notes |
|---|---|---|---|
| 1 | `searxng` | `searxngUrl` config | This deployment's own motor; JSON API; no credential |
| 2 | `tavily` | `TAVILY_API_KEY` credential | 1,000 credits/month on the free tier |
| 3 | `bing` | nothing | HTML scrape; a layout change reads as "no results" |
| 4 | `brave` | `BRAVE_API_KEY` credential | Inert until a key exists |

The order is the contract. A link that fails at request time is skipped for `retryAfterMs` (30 s), so a dead motor costs one slow search rather than one per search. When every link fails, the error names each one and why — an agent can act on `searxng answered 502; tavily has no key; bing returned no results`.

## What the model sees

Nothing new. The tool (`web_search`) and its card belong to `dsh-tool-web` and the client, so this file changes only where results come from. The tool catalog does not move.

## What this plugin deliberately does not have

- **No settings page.** The chain order and the motor URL live in `cordis.patch.yml`, applied by the profile layer, which reloads without a restart. The previous bundle's page wrote the same keys into `$DSH_HOME/settings.yaml` and its values won over the patch; here there is exactly one surface, so nothing can shadow it.
- **No scoring, no auto mode.** The four links are tried in the order above.
- **No client half.** No browser bundle, no routes, no slots.

## Installing and migrating

`install.sh` publishes the plugin into `$DSH_HOME/profiles/node_modules/dsh-web-search-lite` and appends its two patch entries (the provider row and the `web` row's `searchProvider`). It is idempotent and runs from the container entrypoint on every boot.

A deployment that previously ran `dsh-web-search-multi` needs a one-time migration, because that bundle's installer re-adds its rows on every boot: drop `web-search-multi` from the entrypoint's bundle loop and the image, remove its rows and its `web` override from the profile patch layer, delete `profiles/node_modules/dsh-web-search-multi`, and delete the now-orphaned `web-search-multi:` section from `$DSH_HOME/settings.yaml`.

## Verifying

```sh
docker exec -u node mdl-harness-mdl-harness-1 node /opt/mdl-check/check.mjs
```

`check.mjs` mounts the plugin exactly as the Loader does, runs one real search, and reports which link answered plus the state of each link.
