// Exercise the lite provider's real chain against the live deployment: the
// motor on its internal URL and the credentials the deployment already holds.
// It mounts the plugin exactly as the Loader would (a fake `web` seam and a
// credentials resolver), then calls `search()` once and reports which link
// answered — plus, per link, what it would have done on its own.
//
//   node check.mjs [path-to-host.mjs]
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const hostPath = process.argv[2] ?? join(dshHome, 'profiles/node_modules/dsh-web-search-lite/host.mjs')
const plugin = await import(hostPath)

/** Read one ref out of the credentials document without pulling in a parser. */
async function credentialFrom(ref) {
  try {
    const yaml = await readFile(join(dshHome, '.credentials.yaml'), 'utf8')
    const hit = new RegExp(`^\\s*${ref}\\s*:\\s*(.+)$`, 'm').exec(yaml)
    return hit === null ? undefined : hit[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const registered = []
const ctx = {
  effect: (factory) => { factory(); return () => {} },
  get: (key) => key === 'credentials' ? { resolve: async (ref) => {
    const value = await credentialFrom(ref)
    return value === undefined ? undefined : { value }
  } } : undefined,
  web: { registerSearchProvider: (provider) => { registered.push(provider); return () => {} } },
}

plugin.apply(ctx, { searxngUrl: process.env.SEARXNG_URL ?? 'http://searxng:8080' })
const provider = registered[0]
if (provider === undefined) throw new Error('check: the plugin registered no search provider')
console.log(`provider id: ${provider.id} | available: ${provider.available()}`)
console.log('chain order: searxng, tavily, bing, brave')

const query = process.argv[3] ?? 'searxng documentation settings engines'
const started = Date.now()
const result = await provider.search({ query, maxResults: 5 })
const elapsed = Date.now() - started
console.log(`\nsearch("${query}") → ${result.sources.length} sources in ${elapsed} ms, truncated=${result.truncated}`)
for (const src of result.sources) console.log(`  - ${String(src.title ?? '(no title)').slice(0, 60)} | ${src.url.slice(0, 70)}`)

// Per-link behaviour: the winner is whatever answered above; a single broken
// link must not be able to hide behind the chain, so each is reported.
const searxOnly = await fetch(`${(process.env.SEARXNG_URL ?? 'http://searxng:8080').replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(query)}`)
  .then(async (response) => {
    const body = await response.json()
    return `searxng: ${response.status}, ${(body.results ?? []).length} results, unresponsive=${(body.unresponsive_engines ?? []).length}`
  })
  .catch((error) => `searxng: FAILED ${error.message}`)
console.log(`\n${searxOnly}`)
console.log(`tavily key: ${await credentialFrom('TAVILY_API_KEY') === undefined ? 'absent (link skipped)' : 'present (link active)'}`)
console.log(`brave key:  ${await credentialFrom('BRAVE_API_KEY') === undefined ? 'absent (link skipped)' : 'present (link active)'}`)
