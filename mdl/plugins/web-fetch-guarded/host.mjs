/**
 * dsh-web-fetch-guarded — host half.
 *
 * One `ctx.web` fetch provider, id `guarded`. It retrieves a public HTTP(S)
 * resource and refuses every target that resolves into a network this
 * deployment can reach but the model must not: loopback, private, link-local,
 * CGNAT, unique-local, multicast and the IPv4-mapped forms of all of them.
 *
 * The upstream provider (`@deepseek-ai/dsh-web-fetch-http`) documents the same
 * absence as deferred work — "this provider is an SSRF primitive and must not be
 * enabled in a deployment that can reach sensitive internal network targets" —
 * and this deployment reaches `host.docker.internal:11434`, `searxng:8080` and
 * loopback. The guard is therefore the precondition for enabling `web_fetch`
 * (SPEC-031), not an optional hardening layer.
 *
 * Two properties carry the protection, and both are load-bearing:
 *
 *   1. Validation runs on RESOLVED ADDRESSES, never on the hostname, so a name
 *      that resolves somewhere private is refused before a socket opens.
 *   2. The connection is opened to the validated address with the hostname kept
 *      in SNI and the `Host` header, so the name cannot be re-resolved into a
 *      different target between validation and connect (DNS rebinding).
 *
 * Every redirect hop is re-validated, and only same-origin redirects are
 * followed, so a public page cannot bounce the request into an internal one.
 */

import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-fetch-guarded'

/** The seam this provider registers into. */
export const inject = ['web']

/** Provider id the profile's `web` row names in `fetchProvider`. */
export const PROVIDER_ID = 'guarded'

export const Config = z.object({
  /** Wall clock budget for one fetch, redirects included. */
  timeoutMs: z.number().default(30000).min(1000).max(120000),
  /** Raw bytes accepted before the response is refused as too large. */
  maxResponseBytes: z.number().default(5000000).min(1024).max(50000000),
  /** Characters retained in the decoded body handed to the tool. */
  maxBodyChars: z.number().default(100000).min(1000).max(2000000),
  /** Same-origin redirect hops followed before the fetch fails. */
  maxRedirects: z.number().default(5).min(0).max(10),
  /** Longest accepted request URL. */
  maxUrlLength: z.number().default(2048).min(64).max(8192),
  /** Product identity sent to servers; never a browser disguise. */
  userAgent: z.string().default('mdl-harness/1.0 (+web-fetch-guarded)'),
})

/** Addresses inside one of these blocks are never fetched. */
const IPV4_BLOCKED = [
  [/^0\./, 'this-network'],
  [/^10\./, 'private'],
  [/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, 'cgnat'],
  [/^127\./, 'loopback'],
  [/^169\.254\./, 'link-local'],
  [/^172\.(1[6-9]|2\d|3[01])\./, 'private'],
  [/^192\.0\.(0|2)\./, 'reserved'],
  [/^192\.168\./, 'private'],
  [/^198\.(18|19)\./, 'benchmark'],
  [/^198\.51\.100\./, 'documentation'],
  [/^203\.0\.113\./, 'documentation'],
  [/^22[4-9]\.|^23\d\.|^24\d\.|^25[0-5]\./, 'multicast-or-reserved'],
]

/**
 * Report whether one literal address is a public internet destination.
 * @param address - IPv4 or IPv6 literal, never a hostname.
 * @returns `true` only for an address the guard is willing to connect to.
 */
export function isPublicAddress(address) {
  if (net.isIPv4(address)) {
    return !IPV4_BLOCKED.some(([pattern]) => pattern.test(address))
  }
  if (!net.isIPv6(address)) return false
  const literal = address.toLowerCase().split('%')[0]
  if (literal === '::' || literal === '::1') return false
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(literal)
  if (mapped !== null) return isPublicAddress(mapped[1])
  // Any other IPv4-mapped or IPv4-compatible spelling is refused rather than
  // decoded: the dotted form above is the one Node's resolver actually emits.
  if (/^::ffff:/.test(literal)) return false
  if (/^f[cd][0-9a-f]{2}:/.test(literal)) return false
  if (/^fe[89ab][0-9a-f]:/.test(literal)) return false
  if (/^ff[0-9a-f]{2}:/.test(literal)) return false
  if (/^64:ff9b:/.test(literal)) return false
  if (/^2002:/.test(literal)) return false
  if (/^2001:(0|db8):/.test(literal)) return false
  return true
}

/**
 * Validate one request URL before any resolution happens.
 * @param raw - Candidate URL from the model.
 * @param maxUrlLength - Longest accepted URL.
 * @returns The parsed URL.
 */
export function validateRequestUrl(raw, maxUrlLength) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new WebError('web fetch requires an absolute URL', 'WEB_INVALID_URL')
  }
  if (raw.length > maxUrlLength) {
    throw new WebError(`URL is longer than ${maxUrlLength} characters`, 'WEB_INVALID_URL')
  }
  let url
  try {
    url = new URL(raw)
  } catch (error) {
    throw new WebError(`not an absolute URL: ${raw}`, 'WEB_INVALID_URL', { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError(`unsupported scheme ${url.protocol}`, 'WEB_INVALID_URL')
  }
  if (url.username !== '' || url.password !== '') {
    throw new WebError('URLs carrying credentials are refused', 'WEB_BLOCKED_URL')
  }
  return url
}

/**
 * Resolve a URL's hostname and prove every address is public.
 * @param url - Parsed URL to resolve.
 * @returns The addresses the caller may connect to.
 */
async function resolvePublicAddresses(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname) !== 0) {
    if (!isPublicAddress(hostname)) {
      throw new WebError(`refused: ${hostname} is not a public address`, 'WEB_BLOCKED_TARGET')
    }
    return [hostname]
  }
  let records
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw new WebError(`cannot resolve ${hostname}: ${error.message}`, 'WEB_FETCH_RESOLVE_FAILED', {
      cause: error,
    })
  }
  if (records.length === 0) {
    throw new WebError(`cannot resolve ${hostname}: no addresses`, 'WEB_FETCH_RESOLVE_FAILED')
  }
  const blocked = records.find((record) => !isPublicAddress(record.address))
  if (blocked !== undefined) {
    throw new WebError(
      `refused: ${hostname} resolves to ${blocked.address}, which is not a public address`,
      'WEB_BLOCKED_TARGET',
    )
  }
  return records.map((record) => record.address)
}

/** Classify a response body by its content type. */
function classifyContentType(header) {
  const raw = typeof header === 'string' ? header : ''
  const [type, ...parameters] = raw.split(';').map((part) => part.trim())
  const mime = type.toLowerCase()
  const charsetParameter = parameters.find((part) => part.toLowerCase().startsWith('charset='))
  const charset = charsetParameter === undefined ? 'utf-8' : charsetParameter.slice(8).replace(/"/g, '')
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return { kind: 'html', charset }
  const textual =
    mime === '' ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/yaml' ||
    mime === 'application/x-yaml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  if (textual) return { kind: 'text', charset }
  throw new WebError(`unsupported content type ${mime || '(none)'}`, 'WEB_UNSUPPORTED_CONTENT_TYPE')
}

/**
 * Decode a body with the declared charset, falling back to UTF-8.
 * @param buffer - Raw response bytes.
 * @param charset - Charset label from the content type.
 * @returns Decoded text.
 */
function decodeBody(buffer, charset) {
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    // An unrecognized charset label is not a fetch failure: the bytes still
    // decode as UTF-8, and refusing them would turn a cosmetic header into a
    // dead tool call.
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/**
 * Perform one HTTP request against an already-validated address.
 * @param url - Parsed URL being fetched.
 * @param address - Validated address to connect to.
 * @param settings - Resolved provider configuration.
 * @param signal - Caller cancellation.
 * @returns Status code, headers and bounded body bytes.
 */
function requestOnce(url, address, settings, signal) {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:'
    const transport = secure ? https : http
    const request = transport.request(
      {
        host: address,
        port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        signal,
        headers: {
          host: url.host,
          'user-agent': settings.userAgent,
          accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
        },
        ...(secure ? { servername: url.hostname.replace(/^\[|\]$/g, '') } : {}),
      },
      (response) => {
        const chunks = []
        let received = 0
        response.on('data', (chunk) => {
          received += chunk.length
          if (received > settings.maxResponseBytes) {
            response.destroy()
            reject(
              new WebError(
                `response exceeded ${settings.maxResponseBytes} bytes`,
                'WEB_FETCH_TOO_LARGE',
              ),
            )
            return
          }
          chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            buffer: Buffer.concat(chunks),
          })
        })
      },
    )
    request.on('error', reject)
    request.end()
  })
}

/**
 * Fetch one URL with the guard applied to the first hop and every redirect.
 * @param request - Provider request carrying the candidate URL.
 * @param signal - Caller cancellation.
 * @param settings - Resolved provider configuration.
 * @returns The bounded decoded result.
 */
export async function fetchGuarded(request, signal, settings) {
  const deadline = AbortSignal.timeout(settings.timeoutMs)
  const combined = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  let current = validateRequestUrl(request.url, settings.maxUrlLength)
  const origin = current.origin
  for (let hop = 0; ; hop += 1) {
    const addresses = await resolvePublicAddresses(current)
    let response
    try {
      response = await requestOnce(current, addresses[0], settings, combined)
    } catch (error) {
      if (error instanceof WebError) throw error
      if (combined.aborted === true) {
        const timedOut = !(signal?.aborted === true)
        throw new WebError(
          timedOut ? `fetch timed out after ${settings.timeoutMs} ms` : 'fetch aborted by the caller',
          timedOut ? 'WEB_FETCH_TIMEOUT' : 'WEB_ABORTED',
          { cause: error },
        )
      }
      throw new WebError(`fetch failed: ${error.message}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const location = response.headers.location
    const redirecting = [301, 302, 303, 307, 308].includes(response.statusCode)
    if (!redirecting || typeof location !== 'string') {
      const { kind, charset } = classifyContentType(response.headers['content-type'])
      const text = decodeBody(response.buffer, charset)
      const truncated = text.length > settings.maxBodyChars
      return {
        url: current.href,
        statusCode: response.statusCode,
        body: { kind, content: truncated ? text.slice(0, settings.maxBodyChars) : text },
        truncated,
      }
    }
    if (hop >= settings.maxRedirects) {
      throw new WebError(`exceeded ${settings.maxRedirects} redirects`, 'WEB_REDIRECT_BLOCKED')
    }
    const next = new URL(location, current)
    if (next.origin !== origin) {
      throw new WebError(
        `cross-origin redirect to ${next.origin} refused; request it directly`,
        'WEB_REDIRECT_BLOCKED',
      )
    }
    current = validateRequestUrl(next.href, settings.maxUrlLength)
  }
}

/**
 * Register the guarded fetch provider on `ctx.web`.
 * @param ctx - Cordis context carrying the `web` seam.
 * @param config - Raw row configuration; defaults come from {@link Config}.
 */
export function apply(ctx, config) {
  const settings = Config(config ?? {})
  const provider = {
    id: PROVIDER_ID,
    available: () => true,
    fetch: (request, signal) => fetchGuarded(request, signal, settings),
  }
  ctx.effect(() => ctx.web.registerFetchProvider(provider), 'web-fetch-guarded: fetch provider')
}
