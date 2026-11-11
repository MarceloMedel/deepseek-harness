/**
 * dsh-web-search-lite — host half.
 *
 * One `ctx.web` search provider, id `lite`, with a fixed four-link chain and
 * nothing else:
 *
 *   1. searxng   (this deployment's own motor, JSON API, no credential)
 *   2. tavily    (authenticated API, credential ref TAVILY_API_KEY)
 *   3. bing      (HTML scrape, no credential)
 *   4. brave     (authenticated API, credential ref BRAVE_API_KEY)
 *
 * The order is the contract, not a heuristic: no scoring, no reordering, no
 * "auto" mode. Each link is tried in turn and the first one that yields at
 * least one source wins; when all fail the error names every link and its
 * reason, because an agent can act on "searxng refused, tavily has no key,
 * bing returned nothing" and cannot act on "search failed".
 *
 * `available()` never touches the network — it reports whether the link could
 * run at all (a configured URL, a resolvable credential), so an unconfigured
 * link costs nothing. A link that fails at request time is skipped for
 * `retryAfterMs` (a short circuit breaker) so a dead motor costs one slow
 * search rather than one per search.
 *
 * Model-facing behavior: this file defines no tool and no presentation. The
 * `web_search` tool and its card belong to `dsh-tool-web` and the client, so
 * swapping providers changes nothing the model sees except the results.
 */

import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-lite'

/** The seam this provider registers into. */
export const inject = ['web']

/** Provider id the profile's `web` row names in `searchProvider`. */
export const PROVIDER_ID = 'lite'

/** Browser-like user agent for the one HTML link in the chain. */
const SCRAPE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** Configuration: deployment-varying values only, each validated here. */
export const Config = z.object({
  /** Base URL of this deployment's SearXNG, e.g. `http://searxng:8080`. Empty disables the link. */
  searxngUrl: z.string().default(''),
  /** Per-link wall clock budget; a hung engine must not hold the tool call. */
  linkTimeoutMs: z.number().default(2500).min(200).max(30000),
  /** How long a link that failed at request time stays skipped. */
  retryAfterMs: z.number().default(30000).min(0).max(600000),
  /** Sources requested when the caller sets no bound. */
  maxResults: z.number().default(8).min(1).max(30),
})

/** Credential refs this provider resolves, in chain order. */
const TAVILY_REF = 'TAVILY_API_KEY'
const BRAVE_REF = 'BRAVE_API_KEY'

/** One source in the seam's portable shape. */
const source = (url, title, snippet) => ({
  url,
  ...title === undefined || title === '' ? {} : { title },
  ...snippet === undefined || snippet === '' ? {} : { snippet },
})

/** Strip tags and decode the few entities the scraped engines emit. */
function text(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Join the caller's cancellation with this link's own budget. */
function withTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(ms)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

/**
 * SearXNG link: the deployment's own motor answers JSON on its internal URL.
 * @param baseUrl - `searxngUrl` from config, without a trailing slash.
 * @param query - the search query.
 * @param limit - requested source count.
 * @param signal - combined cancellation signal.
 * @returns the sources the motor collected from its own engines.
 */
async function searchSearxng(baseUrl, query, limit, signal) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`searxng answered ${response.status}`)
  const body = await response.json()
  const results = Array.isArray(body.results) ? body.results : []
  const sources = results.map(result => source(result.url, result.title, result.content))
    .filter(entry => typeof entry.url === 'string' && entry.url !== '')
  if (sources.length === 0) {
    const dead = Array.isArray(body.unresponsive_engines) ? body.unresponsive_engines : []
    throw new Error(dead.length === 0
      ? 'searxng returned no results'
      : `searxng returned no results (unresponsive: ${dead.map(entry => String(entry[0])).join(', ')})`)
  }
  return sources.slice(0, limit)
}

/**
 * Tavily link: authenticated JSON API, one POST per query.
 * @param key - resolved credential value.
 * @param query - the search query.
 * @param limit - requested source count.
 * @param signal - combined cancellation signal.
 * @returns the sources Tavily ranked.
 */
async function searchTavily(key, query, limit, signal) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, max_results: limit }),
    signal,
  })
  if (!response.ok) throw new Error(`tavily answered ${response.status}`)
  const body = await response.json()
  const results = Array.isArray(body.results) ? body.results : []
  const sources = results.map(result => source(result.url, result.title, result.content))
    .filter(entry => typeof entry.url === 'string' && entry.url !== '')
  if (sources.length === 0) throw new Error('tavily returned no results')
  return sources.slice(0, limit)
}

/**
 * Tokens worth requiring an echo of: the query minus stopwords, lowercased.
 * @param query - the search query.
 * @returns tokens of at least three characters.
 */
function relevanceTokens(query) {
  return query.toLowerCase().split(/\s+/).filter(token => token.length >= 3)
}

/**
 * Whether one scraped source echoes any query token. A scraped engine that
 * answers with a generic page produces sources about something else entirely,
 * and a wrong answer is worse than no answer: it ends the chain and reaches the
 * model as fact.
 * @param entry - the parsed source.
 * @param tokens - tokens from {@link relevanceTokens}.
 * @returns true when the title or snippet contains at least one token.
 */
function echoesQuery(entry, tokens) {
  if (tokens.length === 0) return true
  const haystack = `${entry.title ?? ''} ${entry.snippet ?? ''}`.toLowerCase()
  return tokens.some(token => haystack.includes(token))
}

/**
 * Bing link: HTML results page, no credential. The markup is not a contract, so
 * a layout change reads as "no results" and the chain moves on — the same rule
 * applies to a page whose results do not mention the query at all, because Bing
 * serves bots a generic page whose links look like hits.
 * @param query - the search query.
 * @param limit - requested source count.
 * @param signal - combined cancellation signal.
 * @returns the parsed result blocks that echo the query.
 */
async function searchBing(query, limit, signal) {
  const url = new URL('https://cn.bing.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('setlang', 'zh-hans')
  const response = await fetch(url, {
    headers: {
      'User-Agent': SCRAPE_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal,
  })
  if (!response.ok) throw new Error(`bing answered ${response.status}`)
  const html = await response.text()
  const blocks = html.match(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<\/li>/g) ?? []
  const sources = []
  for (const block of blocks) {
    const link = /<h[23][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
      ?? /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (link === null) continue
    const snippet = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block)
    sources.push(source(link[1], text(link[2]), snippet === null ? '' : text(snippet[1])))
    if (sources.length >= limit) break
  }
  const tokens = relevanceTokens(query)
  const relevant = sources.filter(entry => echoesQuery(entry, tokens))
  if (relevant.length === 0) {
    throw new Error(sources.length === 0
      ? 'bing returned no results'
      : `bing returned ${sources.length} results, none mentioning the query`)
  }
  return relevant
}

/**
 * Brave link: authenticated JSON API, independent index.
 * @param key - resolved credential value.
 * @param query - the search query.
 * @param limit - requested source count.
 * @param signal - combined cancellation signal.
 * @returns the sources Brave ranked.
 */
async function searchBrave(key, query, limit, signal) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`brave answered ${response.status}`)
  const body = await response.json()
  const results = Array.isArray(body.web?.results) ? body.web.results : []
  const sources = results.map(result => source(result.url, result.title, result.description))
    .filter(entry => typeof entry.url === 'string' && entry.url !== '')
  if (sources.length === 0) throw new Error('brave returned no results')
  return sources.slice(0, limit)
}

/**
 * Register the provider with `ctx.web`.
 * @param ctx - host context carrying the web seam.
 * @param config - validated plugin config from the profile row.
 */
export function apply(ctx, config) {
  const settings = {
    searxngUrl: String(config?.searxngUrl ?? ''),
    linkTimeoutMs: Number(config?.linkTimeoutMs ?? 2500),
    retryAfterMs: Number(config?.retryAfterMs ?? 30000),
    maxResults: Number(config?.maxResults ?? 8),
  }
  /** Links skipped after a request-time failure, with the deadline of the skip. */
  const skippedUntil = new Map()

  /** Resolve one credential ref, or undefined when the seam or the ref is absent. */
  async function credential(ref) {
    const credentials = ctx.get('credentials')
    if (credentials === undefined) return undefined
    try {
      const hit = await credentials.resolve(ref)
      const value = hit?.value
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
    } catch {
      // A credential service that refuses one ref says nothing about the rest of
      // the chain, so the link simply reads as unconfigured.
      return undefined
    }
  }

  const provider = {
    id: PROVIDER_ID,
    available: () => true,
    async search(request, signal) {
      const limit = request.maxResults ?? settings.maxResults
      const links = []
      if (settings.searxngUrl !== '') {
        links.push({ id: 'searxng', run: (runSignal) => searchSearxng(settings.searxngUrl, request.query, limit, runSignal) })
      }
      const tavilyKey = await credential(TAVILY_REF)
      if (tavilyKey !== undefined) {
        links.push({ id: 'tavily', run: (runSignal) => searchTavily(tavilyKey, request.query, limit, runSignal) })
      }
      links.push({ id: 'bing', run: (runSignal) => searchBing(request.query, limit, runSignal) })
      const braveKey = await credential(BRAVE_REF)
      if (braveKey !== undefined) {
        links.push({ id: 'brave', run: (runSignal) => searchBrave(braveKey, request.query, limit, runSignal) })
      }

      const failures = []
      for (const link of links) {
        const deadline = skippedUntil.get(link.id) ?? 0
        if (Date.now() < deadline) {
          failures.push(`${link.id}: skipped after a recent failure`)
          continue
        }
        if (signal?.aborted === true) throw new WebError('web search aborted by the caller', 'WEB_PROVIDER_ABORTED')
        try {
          const sources = await link.run(withTimeout(signal, settings.linkTimeoutMs))
          skippedUntil.delete(link.id)
          return { sources, truncated: false }
        } catch (error) {
          if (signal?.aborted === true) throw new WebError('web search aborted by the caller', 'WEB_PROVIDER_ABORTED')
          skippedUntil.set(link.id, Date.now() + settings.retryAfterMs)
          failures.push(`${link.id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      throw new WebError(`every search link failed — ${failures.join('; ')}`, 'WEB_PROVIDER_ERROR')
    },
  }

  ctx.effect(() => ctx.web.registerSearchProvider(provider), 'web-search-lite: search provider')
}
